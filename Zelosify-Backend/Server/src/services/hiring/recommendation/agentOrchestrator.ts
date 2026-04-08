import { validateAgentDecision, validateFeatureVector, validateResumeParseResult, validateScoringBreakdown } from "./schemaValidator.js";
import { callGroqWithTools } from "./llm/groqToolCallingClient.js";
import { llmToolDeclarations, toolRegistry } from "./toolRegistry.js";
import type { AgentDecision, AgentExecutionMetadata, ToolContext } from "./types.js";
import { logStructured } from "./utils/structuredLogger.js";

const DEFAULT_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const MAX_LLM_TURNS = 2;
const ENABLE_LLM_EXPLANATION =
  String(process.env.RECOMMENDATION_ENABLE_LLM_EXPLANATION || "true").toLowerCase() !== "false";

function safeJsonParse(input: string): any {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

export async function runRecommendationAgent(input: {
  context: ToolContext;
  maxRetries?: number;
}): Promise<{ decision: AgentDecision; metadata: AgentExecutionMetadata; scoring: any }> {
  const startedAt = Date.now();

  const metadata: AgentExecutionMetadata = {
    startedAt,
    toolInvocations: [],
    tokenUsage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    retries: 0,
    model: DEFAULT_MODEL,
  };

  let finalScoring: any = null;
  let llmCallCount = 0;

  const openingTitle = String(input.context.opening?.title || "").trim();
  const openingDescription = String(input.context.opening?.description || "").trim();
  const profileS3Key = String(input.context.profile?.s3Key || "").trim();
  const openingId = String(input.context.opening?.id || "").trim();
  const profileId = Number(input.context.profile?.id || 0);

  if (!openingTitle) {
    throw new Error("Invalid opening payload: title is required for recommendation");
  }

  if (!profileS3Key) {
    throw new Error("Invalid profile payload: s3Key is required for recommendation");
  }

  const safeLlmCall = async (args: {
    model: string;
    messages: Array<Record<string, unknown>>;
    tools: any[];
    temperature?: number;
    traceContext?: {
      profileId: number;
      openingId: string;
    };
  }) => {
    if (llmCallCount >= 3) {
      throw new Error("LLM_CALL_LIMIT_EXCEEDED");
    }

    llmCallCount += 1;
    return callGroqWithTools(args);
  };

  let parsedResumeState: any = input.context.profile.preParsedResume || null;

  const parseResumeViaLlm = async (): Promise<any> => {
    let parsedFromToolCall = false;
    let parsed: any = null;

    for (let turn = 0; turn < MAX_LLM_TURNS; turn += 1) {
      const parseMessages: Array<Record<string, unknown>> = [
        {
          role: "system",
          content:
            "Call resume_parsing_tool exactly once using the provided s3Key. Do not call any other tool.",
        },
        {
          role: "user",
          content: JSON.stringify({
            s3Key: profileS3Key,
            profileId,
            openingId,
            instruction: "Use resume_parsing_tool now.",
          }),
        },
      ];

      const llmResponse = await safeLlmCall({
        model: DEFAULT_MODEL,
        messages: parseMessages,
        tools: llmToolDeclarations.filter((tool) => tool.function.name === "resume_parsing_tool"),
        temperature: 0,
        traceContext: {
          profileId,
          openingId,
        },
      });

      metadata.tokenUsage.promptTokens += Number(llmResponse?.usage?.prompt_tokens || 0);
      metadata.tokenUsage.completionTokens += Number(
        llmResponse?.usage?.completion_tokens || 0
      );
      metadata.tokenUsage.totalTokens += Number(llmResponse?.usage?.total_tokens || 0);

      const choice = llmResponse?.choices?.[0]?.message;
      const toolCalls = Array.isArray(choice?.tool_calls) ? choice.tool_calls : [];
      const resumeCall = toolCalls.find(
        (toolCall: any) => toolCall?.function?.name === "resume_parsing_tool"
      );

      if (!resumeCall) {
        continue;
      }

      const rawArgs = resumeCall.function?.arguments || "{}";
      const args = safeJsonParse(rawArgs) || {};
      args.s3Key = args.s3Key || profileS3Key;
      args.profileId = profileId;
      args.openingId = openingId;

      const toolStart = Date.now();
      const resumeOutput = await (toolRegistry as any).resume_parsing_tool(args);
      const toolEnd = Date.now();

      parsed = validateResumeParseResult(resumeOutput?.parsedResume);
      parsedFromToolCall = true;

      metadata.toolInvocations.push({
        toolName: "resume_parsing_tool",
        startedAt: toolStart,
        completedAt: toolEnd,
        latencyMs: toolEnd - toolStart,
        outputSummary: JSON.stringify(resumeOutput || {}).slice(0, 200),
      });

      break;
    }

    if (!parsedFromToolCall || !parsed) {
      throw new Error("RESUME_PARSE_TOOL_NOT_CALLED");
    }

    return parsed;
  };

  if (!parsedResumeState) {
    // Local parsing retry only; pipeline is not retried.
    try {
      parsedResumeState = await parseResumeViaLlm();
    } catch (firstParseError) {
      metadata.retries += 1;
      logStructured("agent_retry", {
        profileId,
        openingId,
        attempt: 0,
        reason: firstParseError instanceof Error ? firstParseError.message : "Parse attempt failed",
      });

      parsedResumeState = await parseResumeViaLlm();
    }
  }

  // Code-only sequence step 2: skill normalization
  const skillStart = Date.now();
  const normalizedSkillsOutput = await (toolRegistry as any).skill_normalization_tool({
    skills: Array.isArray(parsedResumeState.skills) ? parsedResumeState.skills : [],
  });
  const skillEnd = Date.now();
  const normalizedSkills = Array.isArray(normalizedSkillsOutput?.normalizedSkills)
    ? normalizedSkillsOutput.normalizedSkills.map(String)
    : [];

  parsedResumeState = {
    ...(parsedResumeState as Record<string, unknown>),
    normalizedSkills,
  };

  metadata.toolInvocations.push({
    toolName: "skill_normalization_tool",
    startedAt: skillStart,
    completedAt: skillEnd,
    latencyMs: skillEnd - skillStart,
    outputSummary: JSON.stringify({ normalizedSkills }).slice(0, 200),
  });

  // Code-only sequence step 3: feature extraction
  const featureStart = Date.now();
  const featureOutput = await (toolRegistry as any).feature_extraction_tool({
    parsedResume: parsedResumeState,
    opening: input.context.opening,
  });
  const featureEnd = Date.now();
  const featureVectorState = validateFeatureVector(featureOutput?.featureVector);

  metadata.toolInvocations.push({
    toolName: "feature_extraction_tool",
    startedAt: featureStart,
    completedAt: featureEnd,
    latencyMs: featureEnd - featureStart,
    outputSummary: JSON.stringify(featureOutput || {}).slice(0, 200),
  });

  // Code-only sequence step 4: scoring engine
  const scoringStart = Date.now();
  const scoringOutput = await (toolRegistry as any).scoring_engine({
    skillMatchScore: Number(featureVectorState.skillMatchScore || 0),
    experienceMatchScore: Number(featureVectorState.experienceMatchScore || 0),
    locationMatchScore: Number(featureVectorState.locationMatchScore || 0),
  });
  const scoringEnd = Date.now();

  finalScoring = validateScoringBreakdown(scoringOutput);

  metadata.toolInvocations.push({
    toolName: "scoring_engine",
    startedAt: scoringStart,
    completedAt: scoringEnd,
    latencyMs: scoringEnd - scoringStart,
    outputSummary: JSON.stringify(finalScoring || {}).slice(0, 200),
  });

  let decision: AgentDecision = {
    recommended: Number(finalScoring.finalScore || 0) >= 0.6,
    score: Number(finalScoring.finalScore || 0),
    confidence: Number(
      Math.max(0.3, Math.min(0.95, 0.4 + Number(finalScoring.finalScore || 0) * 0.5))
    ),
    reasoning: "Deterministic score generated from skills, experience, and location matching.",
    breakdown: {
      skillsMatch: Number(finalScoring.skillMatchScore || 0),
      experienceMatch: Number(finalScoring.experienceMatchScore || 0),
      educationMatch: Number(finalScoring.locationMatchScore || 0),
    },
    matchedSkills: Array.isArray(featureVectorState.skills)
      ? featureVectorState.skills.slice(0, 20)
      : [],
    missingSkills: Array.isArray(featureOutput?.requiredSkills)
      ? featureOutput.requiredSkills
          .map(String)
          .filter((skill: string) =>
            !new Set((featureVectorState.skills || []).map((item: string) => item.toLowerCase())).has(
              skill.toLowerCase()
            )
          )
          .slice(0, 20)
      : [],
  };

  if (ENABLE_LLM_EXPLANATION && llmCallCount < 3) {
    // LLM call 2/3: optional explanation only with minimal context.
    const explainResponse = await safeLlmCall({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Given numeric scores, return strict JSON only: {reasoning:string, confidence:number}. Keep reasoning under 220 characters.",
        },
        {
          role: "user",
          content: JSON.stringify({
            openingTitle,
            scores: {
              skillMatchScore: Number(finalScoring.skillMatchScore || 0),
              experienceMatchScore: Number(finalScoring.experienceMatchScore || 0),
              locationMatchScore: Number(finalScoring.locationMatchScore || 0),
              finalScore: Number(finalScoring.finalScore || 0),
            },
          }),
        },
      ],
      tools: [],
      temperature: 0.1,
      traceContext: {
        profileId,
        openingId,
      },
    });

    metadata.tokenUsage.promptTokens += Number(explainResponse?.usage?.prompt_tokens || 0);
    metadata.tokenUsage.completionTokens += Number(
      explainResponse?.usage?.completion_tokens || 0
    );
    metadata.tokenUsage.totalTokens += Number(explainResponse?.usage?.total_tokens || 0);

    const explainOutput = safeJsonParse(
      String(explainResponse?.choices?.[0]?.message?.content || "")
    );

    if (explainOutput) {
      const validatedExplanation = validateAgentDecision({
        ...decision,
        reasoning: explainOutput.reasoning,
        confidence: explainOutput.confidence,
      });

      decision.reasoning = validatedExplanation.reasoning;
      decision.confidence = validatedExplanation.confidence;
    }
  }

  const completedAt = Date.now();
  metadata.completedAt = completedAt;
  metadata.totalLatencyMs = completedAt - startedAt;

  return {
    decision,
    metadata,
    scoring: finalScoring,
  };
}
