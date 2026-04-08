import prisma from "../../../config/prisma/prisma.js";
import { runRecommendationAgent } from "./agentOrchestrator.js";
import { logStructured } from "./utils/structuredLogger.js";
import type { AgentExecutionMetadata } from "./types.js";

const MAX_PROFILE_PROCESSING_MS = Number(process.env.RECOMMENDATION_MAX_PROCESSING_MS || 1500);
const RAW_ASYNC_TIMEOUT_MS = Number(process.env.RECOMMENDATION_ASYNC_TIMEOUT_MS || 300000);
const RECOMMENDATION_ASYNC_TIMEOUT_MS = Number.isFinite(RAW_ASYNC_TIMEOUT_MS)
  ? Math.max(300000, Math.min(RAW_ASYNC_TIMEOUT_MS, 600000))
  : 300000;
const P95_WINDOW_SIZE = 200;
const recentLatenciesMs: number[] = [];

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, code: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const timeoutError = new Error(code);
      (timeoutError as Error & { code?: string }).code = code;
      reject(timeoutError);
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function updateP95Latency(latencyMs: number): number {
  recentLatenciesMs.push(latencyMs);
  if (recentLatenciesMs.length > P95_WINDOW_SIZE) {
    recentLatenciesMs.shift();
  }

  const sorted = [...recentLatenciesMs].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] || latencyMs;
}

function hasPositiveReasoning(reasoning: string): boolean {
  const normalized = reasoning.toLowerCase();
  return (
    normalized.includes("strong match") ||
    normalized.includes("good fit") ||
    normalized.includes("high skill") ||
    normalized.includes("well aligned")
  );
}

export async function processProfileRecommendation(
  profileId: number,
  tenantId: string
): Promise<void> {
  // FIXED: status lifecycle + timeout fallback
  const wallClockStartedAt = Date.now();

  logStructured("recommendation_started", {
    profileId,
    openingId: null,
    startedAt: wallClockStartedAt,
  });

  const profile = await prisma.hiringProfile.findFirst({
    where: {
      id: profileId,
      opening: {
        tenantId,
      },
    },
    include: {
      opening: {
        select: {
          id: true,
          tenantId: true,
          title: true,
          description: true,
          location: true,
          experienceMin: true,
          experienceMax: true,
          hiringManagerId: true,
        },
      },
    },
  });

  if (!profile || profile.isDeleted) {
    return;
  }

  const profileUpdatedAt = (profile as any).updatedAt ?? null;

  const llmStartedAtDate = new Date();
  const processingTransition = await prisma.hiringProfile.updateMany({
    where: {
      id: profile.id,
      opening: {
        tenantId,
      },
      ...(profileUpdatedAt ? { updatedAt: profileUpdatedAt } : {}),
      isDeleted: false,
    },
    data: {
      status: "PROCESSING" as any,
      llmStartedAt: llmStartedAtDate,
      errorMessage: null,
    },
  });

  if (processingTransition.count === 0) {
    logStructured("recommendation_stale_profile_skipped", {
      profileId,
      openingId: profile.openingId,
      reason: "Profile was updated by another worker before PROCESSING transition",
    });
    return;
  }

  const processingState = (await prisma.hiringProfile.findFirst({
    where: {
      id: profile.id,
      opening: {
        tenantId,
      },
    },
    select: { updatedAt: true, submittedAt: true, retryCount: true },
  })) as any;

  if (!processingState) {
    return;
  }

  let decision: {
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
  };
  let metadata: AgentExecutionMetadata;
  let scoring: {
    skillMatchScore: number;
    experienceMatchScore: number;
    locationMatchScore: number;
    finalScore: number;
  };
  const llmStartedAt = Date.now();

  // FIXED: required LLM lifecycle console logs
  console.log("[LLM START]", {
    profileId,
    openingId: profile.openingId,
    timestamp: llmStartedAtDate.toISOString(),
  });

  logStructured("recommendation_llm_started", {
    profileId,
    openingId: profile.openingId,
    llmStartedAt,
    asyncTimeoutMs: RECOMMENDATION_ASYNC_TIMEOUT_MS,
  });

  try {
    const result = await withTimeout(
      runRecommendationAgent({
        context: {
          opening: profile.opening,
          profile: {
            id: profile.id,
            s3Key: profile.s3Key,
            preParsedResume: null,
          },
        },
        maxRetries: 1,
      }),
      RECOMMENDATION_ASYNC_TIMEOUT_MS,
      "RECOMMENDATION_ASYNC_TIMEOUT_EXCEEDED"
    );

    decision = result.decision;
    metadata = result.metadata;
    scoring = result.scoring;

    // FIXED: deterministic scoring is the only score authority.
    if (!scoring || !Number.isFinite(Number(scoring.finalScore))) {
      throw new Error("SCORING_TOOL_OUTPUT_MISSING");
    }

    logStructured("recommendation_llm_completed", {
      profileId,
      openingId: profile.openingId,
      llmDurationMs: Date.now() - llmStartedAt,
      totalLatencyMs: Date.now() - wallClockStartedAt,
      tokenUsage: metadata.tokenUsage,
      retries: metadata.retries,
    });
  } catch (error) {
    const timedOut =
      (error as Error & { code?: string })?.code === "RECOMMENDATION_ASYNC_TIMEOUT_EXCEEDED" ||
      (error as Error)?.message === "RECOMMENDATION_ASYNC_TIMEOUT_EXCEEDED";

    const now = Date.now();
    const errorMessage = error instanceof Error ? error.message : "Unknown recommendation error";
    const normalizedErrorMessage =
      errorMessage === "SCORING_TOOL_OUTPUT_MISSING"
        ? "Deterministic scoring output missing from scoring_engine tool"
        : errorMessage.startsWith("RESUME_PARSE_TOOL_FAILED")
        ? "Resume parsing failed in resume_parsing_tool"
        : errorMessage;

    metadata = {
      startedAt: wallClockStartedAt,
      completedAt: now,
      totalLatencyMs: now - wallClockStartedAt,
      toolInvocations: [],
      tokenUsage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      retries: 0,
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    };

    scoring = {
      skillMatchScore: 0,
      experienceMatchScore: 0,
      locationMatchScore: 0,
      finalScore: 0,
    };

    decision = {
      recommended: false,
      score: 0,
      confidence: timedOut ? 0.1 : 0,
      reasoning: timedOut
        ? "Recommendation timed out before completion."
        : `Recommendation failed: ${normalizedErrorMessage}`,
      breakdown: {
        skillsMatch: 0,
        experienceMatch: 0,
        educationMatch: 0,
      },
      matchedSkills: [],
      missingSkills: [],
    };

    console.log("[LLM ERROR]", {
      profileId,
      error: normalizedErrorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (timedOut) {
      logStructured("recommendation_timeout", {
        profileId,
        openingId: profile.openingId,
        asyncTimeoutMs: RECOMMENDATION_ASYNC_TIMEOUT_MS,
      });
    } else {
      logStructured("recommendation_failed", {
        profileId,
        openingId: profile.openingId,
        error: normalizedErrorMessage,
      });
    }
  }

  const latencyMs = Date.now() - llmStartedAt;
  const processingTimeMs = Date.now() - new Date(processingState.submittedAt).getTime();
  // FIXED: remove LLM score fallback; score must come only from deterministic scoring_engine.
  const score = Number(scoring?.finalScore ?? 0);
  const confidence = Number(decision.confidence ?? 0);
  let recommended = Boolean(decision.recommended);
  let status: "COMPLETED" | "FAILED" | "REVIEW_NEEDED" = "COMPLETED";
  let reasoning = String(decision.reasoning || "No explanation generated.");

  // FIXED: low-score recommendation contradiction guard
  if (recommended && score < 0.4) {
    recommended = false;
    console.warn("[LLM CONTRADICTION DETECTED]", {
      profileId,
      reason: "recommended=true with score<40%",
      score,
      reasoning,
    });
  }

  const positiveReasoning = hasPositiveReasoning(reasoning);
  if (!recommended && positiveReasoning) {
    status = "REVIEW_NEEDED";
    console.warn("[LLM CONTRADICTION DETECTED]", {
      profileId,
      reason: "recommended=false but reasoning is strongly positive",
      response: {
        recommended,
        score,
        confidence,
        reasoning,
      },
    });
  }

  if (reasoning === "Recommendation timed out before completion." || reasoning.startsWith("Recommendation failed:")) {
    status = "FAILED";
    recommended = false;
  }

  const p95LatencyMs = updateP95Latency(latencyMs);
  let executionStatus: "TIMEOUT" | "FAILED" | "COMPLETED" | "REVIEW_NEEDED" = "COMPLETED";
  if (reasoning === "Recommendation timed out before completion.") {
    executionStatus = "TIMEOUT";
  } else if (reasoning.startsWith("Recommendation failed:")) {
    executionStatus = "FAILED";
  } else if (status === "REVIEW_NEEDED") {
    executionStatus = "REVIEW_NEEDED";
  }

  const llmCompletedAtDate = new Date();

  // FIXED: atomic persistence of score/confidence/recommended/reasoning/status
  console.log("[DB Write]", {
    profileId,
    score,
    confidence,
    recommended,
    reasoning,
  });

  try {
    await prisma.$transaction(async (tx) => {
      const writeResult = await tx.hiringProfile.updateMany({
        where: {
          id: profile.id,
          opening: {
            tenantId,
          },
          updatedAt: processingState.updatedAt,
        },
        data: {
          status: status as any,
          recommended,
          recommendationScore: score,
          recommendationReason: reasoning,
          recommendationLatencyMs: latencyMs,
          processingTimeMs,
          recommendationVersion: `groq-${metadata.model}`,
          recommendationConfidence: confidence,
          recommendationBreakdown: decision.breakdown,
          matchedSkills: decision.matchedSkills,
          missingSkills: decision.missingSkills,
          llmCompletedAt: llmCompletedAtDate,
          tokenUsage: metadata.tokenUsage,
          errorMessage: status === "FAILED" ? reasoning : null,
          recommendedAt: new Date(),
        },
      });

      if (writeResult.count === 0) {
        throw new Error("STALE_PROFILE_UPDATE_SKIPPED");
      }

      await tx.$executeRawUnsafe(
        `
          INSERT INTO "recommendationExecutionMetadata" (
            "profileId",
            "startedAt",
            "completedAt",
            "totalLatencyMs",
            "p95LatencyMs",
            "maxProcessingMs",
            "overSla",
            "status",
            "model",
            "retries",
            "tokenUsage",
            "toolInvocations",
            "errorMessage"
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13
          )
        `,
        profile.id,
        new Date(metadata.startedAt),
        metadata.completedAt ? new Date(metadata.completedAt) : null,
        latencyMs,
        p95LatencyMs,
        MAX_PROFILE_PROCESSING_MS,
        latencyMs > MAX_PROFILE_PROCESSING_MS,
        executionStatus,
        metadata.model || null,
        metadata.retries,
        JSON.stringify(metadata.tokenUsage || {}),
        JSON.stringify(metadata.toolInvocations || []),
        executionStatus === "COMPLETED" ? null : reasoning
      );
    });
  } catch (error) {
    if ((error as Error).message === "STALE_PROFILE_UPDATE_SKIPPED") {
      logStructured("recommendation_stale_profile_skipped", {
        profileId,
        openingId: profile.openingId,
        reason: "Profile changed before atomic recommendation write",
      });
      return;
    }
    throw error;
  }

  const afterWrite = await prisma.hiringProfile.findFirst({
    where: {
      id: profile.id,
      opening: {
        tenantId,
      },
    },
    select: {
      recommendationScore: true,
      recommendationConfidence: true,
      recommended: true,
      recommendationReason: true,
      status: true,
    },
  });

  console.log("[DB Write]", {
    profileId,
    after: afterWrite,
  });

  console.log("[LLM END]", {
    profileId,
    latencyMs,
    tokenUsage: metadata.tokenUsage,
    score,
    recommended,
  });

  logStructured("recommendation_db_updated", {
    profileId,
    openingId: profile.openingId,
    executionStatus,
    score,
    recommended,
    totalLatencyMs: latencyMs,
  });

  logStructured("recommendation_completed", {
    profileId,
    openingId: profile.openingId,
    totalLatencyMs: latencyMs,
    p95LatencyMs,
    maxProcessingMs: MAX_PROFILE_PROCESSING_MS,
    overSla: latencyMs > MAX_PROFILE_PROCESSING_MS,
    parsingLatencyMs:
      metadata.toolInvocations.find((item) => item.toolName === "resume_parsing_tool")
        ?.latencyMs || 0,
    featureExtractionLatencyMs:
      metadata.toolInvocations.find((item) => item.toolName === "feature_extraction_tool")
        ?.latencyMs || 0,
    matchingLatencyMs:
      metadata.toolInvocations.find(
        (item) => item.toolName === "deterministic_matching_engine"
      )?.latencyMs || 0,
    scoringLatencyMs:
      metadata.toolInvocations.find((item) => item.toolName === "scoring_engine")
        ?.latencyMs || 0,
    score,
    recommended,
    tokenUsage: metadata.tokenUsage,
    retries: metadata.retries,
    toolInvocations: metadata.toolInvocations,
  });

  if (latencyMs > MAX_PROFILE_PROCESSING_MS) {
    logStructured("recommendation_sla_breach", {
      profileId,
      openingId: profile.openingId,
      totalLatencyMs: latencyMs,
      p95LatencyMs,
      maxProcessingMs: MAX_PROFILE_PROCESSING_MS,
    });
  }
}

export function triggerRecommendationsForProfiles(
  profileIds: number[],
  tenantId: string
) {
  // Fire-and-forget async execution to keep request latency low.
  setImmediate(() => {
    profileIds.forEach(async (id) => {
      logStructured("recommendation_async_job_started", {
        profileId: id,
        openingId: null,
        queuedAt: Date.now(),
      });

      try {
        await processProfileRecommendation(id, tenantId);

        logStructured("recommendation_async_job_finished", {
          profileId: id,
          openingId: null,
          status: "SUCCESS",
        });
      } catch (error) {
        logStructured("recommendation_failed", {
          profileId: id,
          openingId: null,
          error: error instanceof Error ? error.message : "Unknown error",
        });

        await prisma.hiringProfile.updateMany({
          where: {
            id,
            status: "PROCESSING" as any,
            opening: {
              tenantId,
            },
          },
          data: {
            status: "FAILED" as any,
            errorMessage: "Recommendation processing failed unexpectedly.",
            llmCompletedAt: new Date(),
          },
        });

        logStructured("recommendation_async_job_finished", {
          profileId: id,
          openingId: null,
          status: "FAILED",
        });
      }
    });
  });
}
