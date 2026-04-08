import type { FeatureVector } from "../types.js";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isFiniteScore(value: unknown): value is number {
  return Number.isFinite(Number(value));
}

export function deterministicMatchingTool(input: {
  featureVector: FeatureVector;
  requiredSkills: string[];
  opening: {
    experienceMin: number;
    experienceMax: number | null;
    location: string | null;
  };
}) {
  // FIXED: keep visibility into what feature extraction already produced.
  console.log("Using feature extraction scores:", input?.featureVector || {});

  const resumeSkills = Array.isArray(input?.featureVector?.skills)
    ? input.featureVector.skills.map((item) => String(item).toLowerCase())
    : [];
  const requiredSkills = Array.isArray(input?.requiredSkills)
    ? input.requiredSkills.map((item) => String(item).toLowerCase())
    : [];

  const overlap = requiredSkills.filter((skill) => resumeSkills.includes(skill)).length;
  let computedSkillMatchScore = requiredSkills.length > 0 ? overlap / requiredSkills.length : 0;

  const hasReactRelatedSkill = resumeSkills.some((skill) =>
    ["react", "reactjs", "frontend", "component", "redux", "typescript"].includes(skill)
  );

  // FIXED: prevent false zero for obvious React/front-end candidate signals.
  if (computedSkillMatchScore === 0 && hasReactRelatedSkill) {
    computedSkillMatchScore = 0.2;
  }

  const existingSkillMatchScore = isFiniteScore(input?.featureVector?.skillMatchScore)
    ? Number(input.featureVector.skillMatchScore)
    : null;

  const skillMatchScore = clamp01(
    existingSkillMatchScore === null
      ? computedSkillMatchScore
      : Math.max(existingSkillMatchScore, computedSkillMatchScore)
  );

  const exp = Number.isFinite(Number(input?.featureVector?.experienceYears))
    ? Number(input.featureVector.experienceYears)
    : 0;
  const min = Number.isFinite(Number(input?.opening?.experienceMin))
    ? Number(input.opening.experienceMin)
    : 0;
  const max =
    input?.opening?.experienceMax === null || input?.opening?.experienceMax === undefined
      ? null
      : Number.isFinite(Number(input.opening.experienceMax))
      ? Number(input.opening.experienceMax)
      : null;

  let computedExperienceMatchScore = 0;
  if (exp < min) {
    computedExperienceMatchScore = 0;
  } else if (max === null || exp <= max) {
    computedExperienceMatchScore = 1;
  } else {
    computedExperienceMatchScore = 0.8;
  }

  const existingExperienceMatchScore = isFiniteScore(input?.featureVector?.experienceMatchScore)
    ? Number(input.featureVector.experienceMatchScore)
    : null;

  const experienceMatchScore = clamp01(
    existingExperienceMatchScore === null
      ? computedExperienceMatchScore
      : Math.max(existingExperienceMatchScore, computedExperienceMatchScore)
  );

  const openingLocation = String(input?.opening?.location || "Unknown").toLowerCase();
  const candidateLocation = String(input?.featureVector?.location || "Unknown").toLowerCase();

  let locationMatchScore = 0.5;
  if (openingLocation.includes("remote")) {
    locationMatchScore = 1;
  } else if (openingLocation === candidateLocation) {
    locationMatchScore = 1;
  }

  return {
    skillMatchScore,
    experienceMatchScore,
    locationMatchScore,
  };
}
