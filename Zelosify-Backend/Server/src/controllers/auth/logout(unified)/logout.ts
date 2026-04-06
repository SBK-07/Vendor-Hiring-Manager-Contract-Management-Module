import { Request, Response } from "express";
import asyncHandler from "../../../utils/handler/asyncHandler.js";
import { getAdminToken } from "../../../utils/keycloak/getAdminToken.js";
import { getClientSecret } from "../../../config/keycloak/keycloak.js";
import axios from "axios";

export const logout = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Retrieve refresh token from cookies or header.
      const refreshToken =
        req.cookies.refresh_token || req.headers.authorization?.split(" ")[1];

      // If refresh token exists, try to invalidate Keycloak session.
      // Even if this fails, we still clear cookies and return success to avoid sticky sessions.
      if (refreshToken) {
        try {
          const adminToken = await getAdminToken();
          const clientSecret = await getClientSecret(adminToken);

          if (clientSecret) {
            await axios.post(
              `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/logout`,
              new URLSearchParams({
                client_id: process.env.KEYCLOAK_CLIENT_ID!,
                client_secret: clientSecret,
                refresh_token: refreshToken,
              }),
              {
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                },
              }
            );
          }
        } catch (error: any) {
          console.warn(
            "Keycloak logout request failed, proceeding with local cookie clear:",
            error.response?.data || error.message
          );
        }
      }

      // Clear cookies securely
      const isProd = process.env.NODE_ENV === "production";
      res.clearCookie("access_token", {
        httpOnly: true,
        secure: isProd,
        sameSite: "strict",
        path: "/",
      });
      res.clearCookie("refresh_token", {
        httpOnly: true,
        secure: isProd,
        sameSite: "strict",
        path: "/",
      });
      res.clearCookie("temp_token", {
        httpOnly: true,
        secure: isProd,
        sameSite: "strict",
        path: "/",
      });
      res.clearCookie("role", {
        httpOnly: false,
        secure: isProd,
        sameSite: "lax",
        path: "/",
      });
      console.log("Cookies cleared successfully.");

      res.status(200).json({ message: "Logged out successfully" });
      return;
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Error logging out" });
      return;
    }
  }
);
