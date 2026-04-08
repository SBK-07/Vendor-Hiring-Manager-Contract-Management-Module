import type { FeatureVector, ResumeParseResult } from "../types.js";

const OPENING_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "years",
  "year",
  "role",
  "developer",
  "engineer",
  "senior",
  "junior",
  "experience",
  "build",
  "must",
  "have",
  "preferred",
  "skills",
  "responsibilities",
]);

const RESUME_NOISE_WORDS = new Set([
  "email",
  "phone",
  "linkedin",
  "github",
  "summary",
  "professional",
  "profile",
  "resume",
  "curriculum",
  "vitae",
  "india",
  "chennai",
  "bangalore",
]);

const TECH_KEYWORDS = new Set([
  "react",
  "reactjs",
  "frontend",
  "typescript",
  "javascript",
  "redux",
  "nextjs",
  "next",
  "html",
  "css",
  "tailwind",
  "storybook",
  "graphql",
  "node",
  "nodejs",
  "express",
  "aws",
  "docker",
  "kubernetes",
  "microfrontends",
  "component",
  "architecture",
]);

function normalizeToken(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/^[^a-z0-9+#.]+|[^a-z0-9+#.]+$/g, "");
}

function parseParsedResumeInput(rawParsedResume: unknown): Partial<ResumeParseResult> {
  // FIXED: tolerate stringified/nested parsedResume payloads from tool call args
  if (typeof rawParsedResume === "string") {
    try {
      return parseParsedResumeInput(JSON.parse(rawParsedResume));
    } catch {
      return {};
    }
  }

  if (!rawParsedResume || typeof rawParsedResume !== "object") {
    return {};
  }

  const obj = rawParsedResume as Record<string, unknown>;
  if (obj.parsedResume && typeof obj.parsedResume === "object") {
    return parseParsedResumeInput(obj.parsedResume);
  }

  return obj as Partial<ResumeParseResult>;
}

function extractRequiredSkillsFromOpening(opening: { title: string; description: string | null }): string[] {
  const combined = `${opening.title} ${opening.description || ""}`.toLowerCase();
  const tokens = combined.match(/[a-zA-Z][a-zA-Z0-9.+#-]{1,30}/g) || [];

  const normalized = tokens
    .map(normalizeToken)
    .filter((token) => token.length > 2)
    .filter((token) => !OPENING_STOP_WORDS.has(token));

  return Array.from(new Set(normalized)).slice(0, 40);
}

export function featureExtractionTool(input: {
  parsedResume: ResumeParseResult;
  opening: {
    title: string;
    description: string | null;
    location: string | null;
    experienceMin: number;
    experienceMax: number | null;
  };
}): { featureVector: FeatureVector; requiredSkills: string[] } {
  const parsedResumeInput = parseParsedResumeInput(input?.parsedResume);

  const safeOpening = {
    title: String(input?.opening?.title || "").trim() || "Untitled opening",
    description: input?.opening?.description || "",
    location: input?.opening?.location || "Unknown",
    experienceMin: Number.isFinite(Number(input?.opening?.experienceMin))
      ? Number(input.opening.experienceMin)
      : 0,
    experienceMax:
      input?.opening?.experienceMax === null || input?.opening?.experienceMax === undefined
        ? null
        : Number.isFinite(Number(input.opening.experienceMax))
        ? Number(input.opening.experienceMax)
        : null,
  };

  const safeParsedResume = {
    normalizedSkills: Array.isArray(parsedResumeInput?.normalizedSkills)
      ? (parsedResumeInput.normalizedSkills as string[])
      : [],
    skills: Array.isArray(parsedResumeInput?.skills)
      ? (parsedResumeInput.skills as string[])
      : [],
    keywords: Array.isArray(parsedResumeInput?.keywords)
      ? (parsedResumeInput.keywords as string[])
      : [],
    experienceYears: Number.isFinite(Number(parsedResumeInput?.experienceYears))
      ? Number(parsedResumeInput.experienceYears)
      : 0,
    location: String(parsedResumeInput?.location || "Unknown").trim() || "Unknown",
  };

  const requiredSkills = extractRequiredSkillsFromOpening({
    title: safeOpening.title,
    description: safeOpening.description,
  });
  const requiredSkillsSet = new Set(requiredSkills);

  const candidateRawSkills = [
    ...safeParsedResume.normalizedSkills,
    ...safeParsedResume.skills,
    ...safeParsedResume.keywords,
  ];

  const resumeSkills = Array.from(
    new Set(
      candidateRawSkills
        .map(normalizeToken)
        .filter(Boolean)
        // FIXED: remove non-skill noise terms from resume parser output
        .filter((token) => !RESUME_NOISE_WORDS.has(token))
        .filter((token) => !token.includes("@"))
        .filter((token) => !token.includes(".com"))
        .filter((token) => !/^\d+$/.test(token))
        .filter((token) => token.length > 1)
        .filter((token) => requiredSkillsSet.has(token) || TECH_KEYWORDS.has(token))
    )
  );

  const overlapCount = requiredSkills.filter((skill) => resumeSkills.includes(skill)).length;
  const skillMatchScore = requiredSkills.length > 0 ? overlapCount / requiredSkills.length : 0;

  const exp = safeParsedResume.experienceYears;
  const min = safeOpening.experienceMin;
  const max = safeOpening.experienceMax;

  let experienceMatchScore = 0;
  if (exp < min) {
    experienceMatchScore = 0;
  } else if (max === null || exp <= max) {
    experienceMatchScore = 1;
  } else {
    experienceMatchScore = 0.8;
  }

  const openingLocation = safeOpening.location.trim();
  const candidateLocation = safeParsedResume.location.trim();

  let locationMatchScore = 0.5;
  if (/remote/i.test(openingLocation)) {
    locationMatchScore = 1;
  } else if (openingLocation.toLowerCase() === candidateLocation.toLowerCase()) {
    locationMatchScore = 1;
  }

  return {
    featureVector: {
      experienceYears: exp,
      skills: resumeSkills,
      location: candidateLocation,
      skillMatchScore,
      experienceMatchScore,
      locationMatchScore,
    },
    requiredSkills,
  };
}
