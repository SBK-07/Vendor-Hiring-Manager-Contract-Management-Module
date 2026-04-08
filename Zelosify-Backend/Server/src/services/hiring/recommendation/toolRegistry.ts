import { deterministicMatchingTool } from "./tools/deterministicMatchingTool.js";
import { featureExtractionTool } from "./tools/featureExtractionTool.js";
import { resumeParsingTool } from "./tools/resumeParsingTool.js";
import { scoringEngineTool } from "./tools/scoringEngineTool.js";
import { skillNormalizationTool } from "./tools/skillNormalizationTool.js";

export const toolRegistry = {
  resume_parsing_tool: async (args: any) => resumeParsingTool(args),
  feature_extraction_tool: async (args: any) => featureExtractionTool(args),
  skill_normalization_tool: async (args: any) => skillNormalizationTool(args),
  deterministic_matching_engine: async (args: any) => deterministicMatchingTool(args),
  scoring_engine: async (args: any) => scoringEngineTool(args),
};

export const llmToolDeclarations = [
  {
    type: "function" as const,
    function: {
      name: "resume_parsing_tool",
      description: "Parse candidate resume from secure S3 key and produce structured fields.",
      parameters: {
        type: "object",
        properties: {
          s3Key: { type: "string" },
        },
        required: ["s3Key"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "skill_normalization_tool",
      description: "Normalize raw skill names into canonical skill names.",
      parameters: {
        type: "object",
        properties: {
          skills: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["skills"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "feature_extraction_tool",
      description: "Build recommendation feature vector from opening + parsed resume.",
      parameters: {
        type: "object",
        properties: {
          parsedResume: { type: "object" },
          opening: { type: "object" },
        },
        required: ["parsedResume", "opening"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "deterministic_matching_engine",
      description: "Run deterministic matching rules and return individual match scores.",
      parameters: {
        type: "object",
        properties: {
          featureVector: { type: "object" },
          requiredSkills: {
            type: "array",
            items: { type: "string" },
          },
          opening: { type: "object" },
        },
        required: ["featureVector", "requiredSkills", "opening"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "scoring_engine",
      description: "Compute final recommendation score using mandatory deterministic formula.",
      parameters: {
        type: "object",
        properties: {
          skillMatchScore: { type: "number" },
          experienceMatchScore: { type: "number" },
          locationMatchScore: { type: "number" },
        },
        required: ["skillMatchScore", "experienceMatchScore", "locationMatchScore"],
      },
    },
  },
];
