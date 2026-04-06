import type { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../../types/typeIndex.js";
import { isValidRole } from "../../utils/RBAC/isValidRole.js";

export function authorizeRole(requiredrole: string) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    // Validate the provided role
    if (!isValidRole(requiredrole)) {
      res.status(400).json({ message: "Invalid role provided." });
      return;
    }

    // authenticateUser middleware should populate req.user before this middleware runs.
    if (!req.user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (req.user.role !== requiredrole) {
      return res.status(403).json({
        message: `Access Denied: User does not have required role ${requiredrole}`,
      });
    }

    console.log("Authorize Role Middleware Passed ✅ : ", req.user);
    next();
  };
}
