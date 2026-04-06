import { Request, Response } from "express";
import axios from "axios";
import { getKeycloakClientSecret } from "../../../../utils/keycloak/getKeycloakClientSecret.js";

export const refreshAccessToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
      res.status(401).json({ message: "Refresh token not found" });
      return;
    }

    const clientSecret = await getKeycloakClientSecret();

    const tokenResponse = await axios.post(
      `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.KEYCLOAK_CLIENT_ID!,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    res.cookie("access_token", tokenResponse.data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 4 * 3600 * 1000,
      path: "/",
    });

    if (tokenResponse.data.refresh_token) {
      res.cookie("refresh_token", tokenResponse.data.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000,
        path: "/",
      });
    }

    res.status(200).json({ message: "Token refreshed" });
  } catch (error: any) {
    console.error("Token refresh failed:", error.response?.data || error.message);
    res.status(401).json({ message: "Failed to refresh token" });
  }
};
