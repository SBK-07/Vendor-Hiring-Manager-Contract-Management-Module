import { Router, type RequestHandler } from "express";
import { authenticateUser } from "../../middlewares/auth/authenticateMiddleware.js";
import { authorizeRole } from "../../middlewares/auth/authorizeMiddleware.js";
import {
  getProfileResumeUrl,
  getHiringManagerOpenings,
  getOpeningProfilesForHiringManager,
  rejectProfile,
  retryProfileRecommendation,
  shortlistProfile,
} from "../../controllers/controllers.js";

const router = Router();

/**
 * =============================================================================
 * HIRING MANAGER ROUTES - VACANCY MANAGEMENT
 * =============================================================================
 */

/**
 * GET /api/v1/hiring-manager/openings
 * @requires HIRING_MANAGER role
 */
router.get(
  "/openings",
  authenticateUser as RequestHandler,
  authorizeRole("HIRING_MANAGER") as RequestHandler,
  getHiringManagerOpenings as RequestHandler
);

/**
 * GET /api/v1/hiring-manager/openings/:id/profiles
 */
router.get(
  "/openings/:id/profiles",
  authenticateUser as RequestHandler,
  authorizeRole("HIRING_MANAGER") as RequestHandler,
  getOpeningProfilesForHiringManager as RequestHandler
);

/**
 * POST /api/v1/hiring-manager/profiles/:id/shortlist
 */
router.post(
  "/profiles/:id/retry",
  authenticateUser as RequestHandler,
  authorizeRole("HIRING_MANAGER") as RequestHandler,
  retryProfileRecommendation as RequestHandler
);

router.get(
  "/profiles/:id/resume-url",
  authenticateUser as RequestHandler,
  authorizeRole("HIRING_MANAGER") as RequestHandler,
  getProfileResumeUrl as RequestHandler
);

router.post(
  "/profiles/:id/shortlist",
  authenticateUser as RequestHandler,
  authorizeRole("HIRING_MANAGER") as RequestHandler,
  shortlistProfile as RequestHandler
);

/**
 * POST /api/v1/hiring-manager/profiles/:id/reject
 */
router.post(
  "/profiles/:id/reject",
  authenticateUser as RequestHandler,
  authorizeRole("HIRING_MANAGER") as RequestHandler,
  rejectProfile as RequestHandler
);

export default router;
