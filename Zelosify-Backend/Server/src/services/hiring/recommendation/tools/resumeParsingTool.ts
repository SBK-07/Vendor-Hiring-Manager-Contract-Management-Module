import { createStorageService } from "../../../storage/storageFactory.js";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { PDFParse } from "pdf-parse";
import { sanitizeResumeContent } from "../utils/sanitizeResumeContent.js";
import type { ResumeParseResult } from "../types.js";
import { logStructured } from "../utils/structuredLogger.js";

const storageService = createStorageService();
const MAX_LLM_RESUME_TEXT_CHARS = Number(process.env.RECOMMENDATION_RESUME_TEXT_MAX_CHARS || 2500);

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return Buffer.concat(chunks);
}

function getFileExtensionFromS3Key(s3Key: string): string {
  const cleanedKey = s3Key.split("?")[0] || s3Key;
  const dotIndex = cleanedKey.lastIndexOf(".");
  if (dotIndex < 0) {
    return "";
  }

  return cleanedKey.slice(dotIndex + 1).toLowerCase();
}

function collectSlideText(node: unknown, sink: string[]) {
  if (node === null || node === undefined) {
    return;
  }

  if (typeof node === "string") {
    const value = node.trim();
    if (value) {
      sink.push(value);
    }
    return;
  }

  if (Array.isArray(node)) {
    for (const entry of node) {
      collectSlideText(entry, sink);
    }
    return;
  }

  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "t" && typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) {
          sink.push(trimmed);
        }
        continue;
      }
      collectSlideText(value, sink);
    }
  }
}

async function parsePdfText(
  buffer: Buffer,
  logContext: { profileId: number | null; openingId: string | null }
): Promise<string> {
  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    return typeof parsed?.text === "string" ? parsed.text : "";
  } catch (error) {
    logStructured("resume_parse_pdf_failed", {
      profileId: logContext.profileId,
      openingId: logContext.openingId,
      error: error instanceof Error ? error.message : "Unknown pdf parse error",
    });
    throw error;
  } finally {
    if (parser) {
      await parser.destroy();
    }
  }
}

async function parsePptxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    trimValues: true,
  });

  const slideEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const aNo = Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0);
      const bNo = Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0);
      return aNo - bNo;
    });

  const slideTexts: string[] = [];

  for (const slideFile of slideEntries) {
    const xmlContent = await zip.file(slideFile)?.async("string");
    if (!xmlContent) {
      continue;
    }

    const parsed = parser.parse(xmlContent);
    collectSlideText(parsed, slideTexts);
  }

  return slideTexts.join(" ");
}

async function extractResumeText(
  buffer: Buffer,
  extension: string,
  logContext: { profileId: number | null; openingId: string | null }
): Promise<string> {
  if (extension === "pdf") {
    return parsePdfText(buffer, logContext);
  }

  if (extension === "pptx") {
    return parsePptxText(buffer);
  }

  throw new Error("UNSUPPORTED_RESUME_TYPE");
}

function estimateExperienceYears(text: string): number {
  const match = text.match(/(\d{1,2})\+?\s*(years?|yrs?)/i);
  if (match) {
    return Number(match[1]);
  }

  return 0;
}

function extractSkills(text: string): string[] {
  const candidates = text
    .toLowerCase()
    .match(/[a-zA-Z][a-zA-Z0-9.+#-]{1,30}/g);

  if (!candidates) {
    return [];
  }

  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "have",
    "has",
    "are",
    "was",
    "were",
    "will",
    "you",
    "your",
    "team",
    "experience",
    "candidate",
    "resume",
  ]);

  return Array.from(new Set(candidates.filter((token) => !stopWords.has(token)))).slice(0, 40);
}

export async function resumeParsingTool(input: {
  s3Key: string;
  profileId?: number;
  openingId?: string;
}): Promise<{ parsedResume: ResumeParseResult; sanitizedResumeText: string }> {
  if (!input?.s3Key || !input.s3Key.trim()) {
    throw new Error("RESUME_S3_KEY_REQUIRED");
  }

  const stream = await storageService.getObjectStream(input.s3Key);
  const fileBuffer = await streamToBuffer(stream);
  const extension = getFileExtensionFromS3Key(input.s3Key);
  const profileId = Number.isFinite(Number(input.profileId)) ? Number(input.profileId) : null;
  const openingId = input.openingId ? String(input.openingId) : null;

  logStructured("resume_parse_started", {
    profileId,
    openingId,
    s3Key: input.s3Key,
    extension,
    sizeBytes: fileBuffer.length,
  });

  const rawText = await extractResumeText(fileBuffer, extension, { profileId, openingId });
  const sanitized = sanitizeResumeContent(rawText);
  const trimmedForLlm = sanitized.slice(0, Math.max(1000, MAX_LLM_RESUME_TEXT_CHARS));

  logStructured("resume_parse_text_extracted", {
    profileId,
    openingId,
    s3Key: input.s3Key,
    rawLength: rawText?.length || 0,
    sanitizedLength: sanitized?.length || 0,
    llmTrimmedLength: trimmedForLlm.length,
  });

  if (!sanitized || sanitized.length < 20) {
    throw new Error("EMPTY_RESUME_TEXT");
  }

  const parsedResume: ResumeParseResult = {
    experienceYears: estimateExperienceYears(sanitized),
    skills: extractSkills(sanitized),
    normalizedSkills: [],
    location: /remote/i.test(sanitized) ? "Remote" : "Unknown",
    education: [],
    keywords: extractSkills(sanitized).slice(0, 20),
  };

  return {
    parsedResume,
    // FIXED: token reduction by avoiding full raw resume payload to the model
    sanitizedResumeText: trimmedForLlm,
  };
}
