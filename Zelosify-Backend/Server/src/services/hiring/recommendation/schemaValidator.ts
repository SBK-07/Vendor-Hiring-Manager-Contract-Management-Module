import type { AgentDecision, FeatureVector, ResumeParseResult, ScoringBreakdown } from "./types.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeRatio(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  if (numeric > 1) {
    return clamp(numeric / 100, 0, 1);
  }

  return clamp(numeric, 0, 1);
}

export function validateResumeParseResult(input: any): ResumeParseResult {
  return {
    experienceYears: Number.isFinite(Number(input?.experienceYears))
      ? clamp(Number(input.experienceYears), 0, 60)
      : 0,
    skills: Array.isArray(input?.skills)
      ? input.skills.map(String).map((s: string) => s.trim()).filter(Boolean)
      : [],
    normalizedSkills: Array.isArray(input?.normalizedSkills)
      ? input.normalizedSkills
          .map(String)
          .map((s: string) => s.trim().toLowerCase())
          .filter(Boolean)
      : [],
    location: typeof input?.location === "string" ? input.location.trim() : "Unknown",
    education: Array.isArray(input?.education)
      ? input.education.map(String).map((s: string) => s.trim()).filter(Boolean)
      : [],
    keywords: Array.isArray(input?.keywords)
      ? input.keywords.map(String).map((s: string) => s.trim()).filter(Boolean)
      : [],
  };
}

export function validateFeatureVector(input: any): FeatureVector {
  return {
    experienceYears: Number.isFinite(Number(input?.experienceYears))
      ? clamp(Number(input.experienceYears), 0, 60)
      : 0,
    skills: Array.isArray(input?.skills)
      ? input.skills
          .map(String)
          .map((s: string) => s.trim().toLowerCase())
          .filter(Boolean)
      : [],
    location: typeof input?.location === "string" ? input.location.trim() : "Unknown",
    skillMatchScore: Number.isFinite(Number(input?.skillMatchScore))
      ? clamp(Number(input.skillMatchScore), 0, 1)
      : 0,
    experienceMatchScore: Number.isFinite(Number(input?.experienceMatchScore))
      ? clamp(Number(input.experienceMatchScore), 0, 1)
      : 0,
    locationMatchScore: Number.isFinite(Number(input?.locationMatchScore))
      ? clamp(Number(input.locationMatchScore), 0, 1)
      : 0,
  };
}

export function validateScoringBreakdown(input: any): ScoringBreakdown {
  return {
    skillMatchScore: Number.isFinite(Number(input?.skillMatchScore))
      ? clamp(Number(input.skillMatchScore), 0, 1)
      : 0,
    experienceMatchScore: Number.isFinite(Number(input?.experienceMatchScore))
      ? clamp(Number(input.experienceMatchScore), 0, 1)
      : 0,
    locationMatchScore: Number.isFinite(Number(input?.locationMatchScore))
      ? clamp(Number(input.locationMatchScore), 0, 1)
      : 0,
    finalScore: Number.isFinite(Number(input?.finalScore))
      ? clamp(Number(input.finalScore), 0, 1)
      : 0,
  };
}

export function validateAgentDecision(input: any): AgentDecision {
  const score = normalizeRatio(input?.score, 0);
  const confidence = normalizeRatio(input?.confidence, 0.5);

  const normalizedReasoning =
    typeof input?.reasoning === "string" && input.reasoning.trim().length > 0
      ? input.reasoning.trim().slice(0, 500)
      : typeof input?.reason === "string" && input.reason.trim().length > 0
      ? input.reason.trim().slice(0, 500)
      : "No explanation generated.";

  return {
    recommended: Boolean(input?.recommended),
    score,
    confidence,
    reasoning: normalizedReasoning,
    breakdown: {
      skillsMatch: normalizeRatio(input?.breakdown?.skillsMatch, 0),
      experienceMatch: normalizeRatio(input?.breakdown?.experienceMatch, 0),
      educationMatch: normalizeRatio(input?.breakdown?.educationMatch, 0),
    },
    matchedSkills: Array.isArray(input?.matchedSkills)
      ? input.matchedSkills.map(String).map((skill: string) => skill.trim()).filter(Boolean)
      : [],
    missingSkills: Array.isArray(input?.missingSkills)
      ? input.missingSkills.map(String).map((skill: string) => skill.trim()).filter(Boolean)
      : [],
  };
}
