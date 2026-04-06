// src/routers/auth/normalAuthRoutes.ts
import {
  Router,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import asyncHandler from "../../../utils/handler/asyncHandler.js";
import {
  getTokenDebugInfo,
  logout,
  refreshAccessToken,
  register,
  verifyLogin,
  verifyTOTP,
} from "../../../controllers/controllers.js";
import { AuthenticatedRequest } from "../../../types/common.js";

/**
 * Wraps async handlers to ensure void return type
 * @param handler - The request handler to wrap
 * @returns Wrapped RequestHandler with proper error handling
 */
const wrapHandler = (handler: RequestHandler): RequestHandler =>
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    await handler(req, res, next);
  });

/**
 * Wraps async handlers for middleware-protected routes
 * @param handler - The request handler to wrap
 * @returns Wrapped RequestHandler with proper error handling
 */
const wrapProtectedHandler = (handler: RequestHandler): RequestHandler =>
  asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      await handler(req, res, next);
    }
  );

const router = Router();

/**
 * =============================================================================
 * LOCAL AUTHENTICATION ROUTES
 * =============================================================================
 */

/**
 * POST /register - Register new user account
 * Creates a new user account with provided credentials
 */
router.post("/register", wrapHandler(register));

/**
 * POST /verify-login - Verify user login credentials
 * Validates user credentials and initiates login process
 */
router.post("/verify-login", wrapHandler(verifyLogin));

/**
 * POST /verify-totp - Verify TOTP for two-factor authentication
 * Validates TOTP code for users with 2FA enabled
 */
router.post("/verify-totp", wrapHandler(verifyTOTP));

/**
 * POST /refresh-token - Refresh access token using refresh token cookie
 */
router.post("/refresh-token", wrapHandler(refreshAccessToken));

/**
 * GET /debug/token - Temporary token/DB mapping diagnostics endpoint
 * Requires AUTH_DEBUG_ENDPOINT_ENABLED=true in backend env.
 */
router.get("/debug/token", wrapHandler(getTokenDebugInfo));

/**
 * POST /logout - Logout authenticated user
 * Clears local session cookies even if access token is expired
 */
router.post("/logout", wrapHandler(logout as RequestHandler));

export default router;
