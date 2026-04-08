export interface ResumeParseResult {
  experienceYears: number;
  skills: string[];
  normalizedSkills: string[];
  location: string;
  education: string[];
  keywords: string[];
}

export interface FeatureVector {
  experienceYears: number;
  skills: string[];
  location: string;
  skillMatchScore: number;
  experienceMatchScore: number;
  locationMatchScore: number;
}

export interface ScoringBreakdown {
  skillMatchScore: number;
  experienceMatchScore: number;
  locationMatchScore: number;
  finalScore: number;
}

export interface AgentDecision {
  recommended: boolean;
  score: number;
  confidence: number;
  reasoning: string;
  breakdown: {
    skillsMatch: number;
    experienceMatch: number;
    educationMatch: number;
  };
  matchedSkills: string[];
  missingSkills: string[];
}

export interface ToolContext {
  opening: {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    experienceMin: number;
    experienceMax: number | null;
    hiringManagerId: string;
  };
  profile: {
    id: number;
    s3Key: string;
    preParsedResume?: ResumeParseResult | null;
  };
}

export interface ToolInvocationRecord {
  toolName: string;
  startedAt: number;
  completedAt: number;
  latencyMs: number;
  outputSummary: string;
}

export interface AgentExecutionMetadata {
  startedAt: number;
  completedAt?: number;
  totalLatencyMs?: number;
  toolInvocations: ToolInvocationRecord[];
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  retries: number;
  model: string;
  contradictionDetected?: boolean;
}
