import type { ScoringBreakdown } from "../types.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function scoringEngineTool(input: {
  skillMatchScore: number;
  experienceMatchScore: number;
  locationMatchScore: number;
}): ScoringBreakdown {
  const skillMatchScore = clamp(Number(input.skillMatchScore || 0));
  const experienceMatchScore = clamp(Number(input.experienceMatchScore || 0));
  const locationMatchScore = clamp(Number(input.locationMatchScore || 0));

  const finalScore = clamp(
    0.5 * skillMatchScore + 0.3 * experienceMatchScore + 0.2 * locationMatchScore
  );

  return {
    skillMatchScore,
    experienceMatchScore,
    locationMatchScore,
    finalScore,
  };
}
