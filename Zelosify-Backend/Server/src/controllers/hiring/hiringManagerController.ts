import type { Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma/prisma.js";
import type { AuthenticatedRequest } from "../../types/typeIndex.js";
import { logStructured } from "../../services/hiring/recommendation/utils/structuredLogger.js";
import { createStorageService } from "../../services/storage/storageFactory.js";
import { triggerRecommendationsForProfiles } from "../../services/hiring/recommendation/recommendationService.js";

const storageService = createStorageService();

function getHiringManagerContext(req: AuthenticatedRequest) {
  const userId = req.user?.id;
  const tenantId = req.user?.tenant?.tenantId;

  if (!userId || !tenantId) {
    return null;
  }

  return { userId, tenantId };
}

function getRecommendationBadge(
  status: string,
  score: number | null
): "Pending" | "Review Needed" | "Recommended" | "Borderline" | "Not Recommended" {
  if (status === "SUBMITTED" || status === "PROCESSING") {
    return "Pending";
  }

  if (status === "REVIEW_NEEDED") {
    return "Review Needed";
  }

  if (status !== "COMPLETED") {
    return "Not Recommended";
  }

  const normalizedScore = Number(score ?? 0);
  if (normalizedScore >= 0.75) {
    return "Recommended";
  }
  if (normalizedScore >= 0.5) {
    return "Borderline";
  }
  return "Not Recommended";
}

export async function getHiringManagerOpenings(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const context = getHiringManagerContext(req);
    if (!context) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const openings = await prisma.opening.findMany({
      where: {
        tenantId: context.tenantId,
        hiringManagerId: context.userId,
      },
      orderBy: [{ status: "asc" }, { postedDate: "desc" }],
      select: {
        id: true,
        title: true,
        description: true,
        location: true,
        contractType: true,
        postedDate: true,
        status: true,
        experienceMin: true,
        experienceMax: true,
        _count: {
          select: {
            hiringProfiles: {
              where: {
                isDeleted: false,
              },
            },
          },
        },
      },
    });

    res.status(200).json({
      message: "Openings fetched successfully",
      data: openings.map((opening) => ({
        ...opening,
        profilesCount: opening._count.hiringProfiles,
      })),
    });
  } catch (error) {
    logStructured("hiring_manager_fetch_openings_failed", {
      userId: req.user?.id,
      tenantId: req.user?.tenant?.tenantId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ message: "Failed to fetch openings" });
  }
}

export async function getOpeningProfilesForHiringManager(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const context = getHiringManagerContext(req);
    if (!context) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const openingId = req.params.id;

    const opening = await prisma.opening.findFirst({
      where: {
        id: openingId,
        tenantId: context.tenantId,
        hiringManagerId: context.userId,
      },
      select: {
        id: true,
        title: true,
        location: true,
        contractType: true,
        status: true,
      },
    });

    if (!opening) {
      res.status(404).json({ message: "Opening not found" });
      return;
    }

    const profiles = await prisma.hiringProfile.findMany({
      where: {
        openingId,
        isDeleted: false,
        opening: {
          id: openingId,
          tenantId: context.tenantId,
          hiringManagerId: context.userId,
        },
      },
      orderBy: { submittedAt: "desc" },
      select: {
        id: true,
        s3Key: true,
        fileHash: true,
        submittedAt: true,
        updatedAt: true,
        status: true,
        errorMessage: true,
        retryCount: true,
        recommendationScore: true,
        recommendationConfidence: true,
        recommendationReason: true,
        recommendationBreakdown: true,
        recommendationLatencyMs: true,
        processingTimeMs: true,
        matchedSkills: true,
        missingSkills: true,
        tokenUsage: true,
        uploadedBy: true,
      },
    });

    const profilesWithBadge = profiles.map((profile) => ({
      ...profile,
      recommendationBadge: getRecommendationBadge(profile.status, profile.recommendationScore),
    }));

    res.status(200).json({
      message: "Profiles fetched successfully",
      data: {
        opening,
        profiles: profilesWithBadge,
      },
    });
  } catch (error) {
    logStructured("hiring_manager_fetch_profiles_failed", {
      openingId: req.params.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ message: "Failed to fetch profiles" });
  }
}

async function updateProfileDecision(
  req: AuthenticatedRequest,
  res: Response,
  status: "SHORTLISTED" | "REJECTED"
): Promise<void> {
  const context = getHiringManagerContext(req);
  if (!context) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const profileId = Number(req.params.id);
  if (Number.isNaN(profileId)) {
    res.status(400).json({ message: "Invalid profile id" });
    return;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const profile = await tx.hiringProfile.findFirst({
        where: {
          id: profileId,
          isDeleted: false,
          opening: {
            tenantId: context.tenantId,
            hiringManagerId: context.userId,
          },
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!profile) {
        throw new Error("PROFILE_NOT_FOUND");
      }

      if (status === "SHORTLISTED" && profile.status === "SHORTLISTED") {
        return { id: profile.id, status: profile.status, idempotent: true };
      }

      if (status === "REJECTED" && profile.status === "REJECTED") {
        return { id: profile.id, status: profile.status, idempotent: true };
      }

      const data =
        status === "SHORTLISTED"
          ? {
              // FIXED: avoid lifecycle status corruption while supporting manual decision
              shortlistedBy: context.userId,
              shortlistedAt: new Date(),
              rejectedBy: null,
              rejectedAt: null,
              recommended: true,
            }
          : {
              rejectedBy: context.userId,
              rejectedAt: new Date(),
              shortlistedBy: null,
              shortlistedAt: null,
              recommended: false,
            };

      const updatedResult = await tx.hiringProfile.updateMany({
        where: {
          id: profile.id,
          isDeleted: false,
          opening: {
            tenantId: context.tenantId,
            hiringManagerId: context.userId,
          },
        },
        data,
      });

      if (updatedResult.count === 0) {
        throw new Error("PROFILE_NOT_FOUND");
      }

      return { id: profile.id, status: profile.status, idempotent: false };
    });

    res.status(200).json({
      message: `${status} action completed`,
      data: result,
    });
  } catch (error) {
    if ((error as Error).message === "PROFILE_NOT_FOUND") {
      res.status(404).json({ message: "Profile not found" });
      return;
    }

    logStructured("hiring_manager_update_profile_failed", {
      profileId,
      requestedStatus: status,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ message: "Failed to update profile" });
  }
}

export async function shortlistProfile(req: AuthenticatedRequest, res: Response) {
  return updateProfileDecision(req, res, "SHORTLISTED");
}

export async function rejectProfile(req: AuthenticatedRequest, res: Response) {
  return updateProfileDecision(req, res, "REJECTED");
}

export async function retryProfileRecommendation(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const context = getHiringManagerContext(req);
  if (!context) {
    res.status(401).json({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }

  const profileId = Number(req.params.id);
  if (Number.isNaN(profileId)) {
    res.status(400).json({ success: false, error: "Invalid profile id", code: "INVALID_INPUT" });
    return;
  }

  try {
    const profile = await prisma.hiringProfile.findFirst({
      where: {
        id: profileId,
        isDeleted: false,
        opening: {
          tenantId: context.tenantId,
          hiringManagerId: context.userId,
        },
      },
      select: {
        id: true,
        status: true,
        retryCount: true,
      },
    });

    if (!profile) {
      res.status(404).json({ success: false, error: "Profile not found", code: "NOT_FOUND" });
      return;
    }

    const currentStatus = String(profile.status);

    if (currentStatus === "PROCESSING") {
      res.status(409).json({ success: false, error: "Profile is already processing", code: "ALREADY_PROCESSING" });
      return;
    }

    if (!["FAILED", "REVIEW_NEEDED", "COMPLETED"].includes(currentStatus)) {
      res.status(400).json({ success: false, error: "Retry is allowed only for failed/review/completed profiles", code: "INVALID_STATUS" });
      return;
    }

    // NEW: retry endpoint state reset
    const retryUpdate = await prisma.hiringProfile.updateMany({
      where: {
        id: profile.id,
        isDeleted: false,
        opening: {
          tenantId: context.tenantId,
          hiringManagerId: context.userId,
        },
      },
      data: {
        status: "SUBMITTED" as any,
        recommended: null,
        recommendationScore: null,
        recommendationConfidence: null,
        recommendationReason: null,
        recommendationBreakdown: Prisma.JsonNull,
        matchedSkills: [],
        missingSkills: [],
        recommendationLatencyMs: null,
        processingTimeMs: null,
        tokenUsage: Prisma.JsonNull,
        llmStartedAt: null,
        llmCompletedAt: null,
        errorMessage: null,
        retryCount: (profile.retryCount || 0) + 1,
      },
    });

    if (retryUpdate.count === 0) {
      res.status(404).json({ success: false, error: "Profile not found", code: "NOT_FOUND" });
      return;
    }

    triggerRecommendationsForProfiles([profile.id], context.tenantId);

    res.status(200).json({ success: true, message: "Retry queued", data: { profileId: profile.id } });
  } catch (error) {
    logStructured("hiring_manager_retry_failed", {
      profileId,
      userId: context.userId,
      tenantId: context.tenantId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ success: false, error: "Failed to queue retry", code: "LLM_FAILURE" });
  }
}

export async function getProfileResumeUrl(req: AuthenticatedRequest, res: Response): Promise<void> {
  const context = getHiringManagerContext(req);
  if (!context) {
    res.status(401).json({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }

  const profileId = Number(req.params.id);
  if (Number.isNaN(profileId)) {
    res.status(400).json({ success: false, error: "Invalid profile id", code: "INVALID_INPUT" });
    return;
  }

  try {
    const profile = await prisma.hiringProfile.findFirst({
      where: {
        id: profileId,
        isDeleted: false,
        opening: {
          tenantId: context.tenantId,
          hiringManagerId: context.userId,
        },
      },
      select: {
        id: true,
        s3Key: true,
      },
    });

    if (!profile) {
      res.status(404).json({ success: false, error: "Profile not found", code: "NOT_FOUND" });
      return;
    }

    const resumeUrl = await storageService.getObjectURL(profile.s3Key, 900);

    res.status(200).json({ success: true, data: { resumeUrl } });
  } catch (error) {
    logStructured("hiring_manager_resume_url_failed", {
      profileId,
      userId: context.userId,
      tenantId: context.tenantId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ success: false, error: "Failed to generate resume URL", code: "STORAGE_FAILURE" });
  }
}
