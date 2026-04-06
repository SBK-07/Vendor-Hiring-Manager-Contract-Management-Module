import { Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import prisma from "../../../config/prisma/prisma.js";

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8080/auth";
const REALM_NAME = process.env.KEYCLOAK_REALM || "Zelosify";

const keycloakJwksClient = jwksClient({
  jwksUri: `${KEYCLOAK_URL}/realms/${REALM_NAME}/protocol/openid-connect/certs`,
  cache: true,
  cacheMaxAge: 86400000,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

export const getTokenDebugInfo = async (
  req: Request,
  res: Response
): Promise<void> => {
  const enabled = process.env.AUTH_DEBUG_ENDPOINT_ENABLED === "true";

  if (!enabled) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  try {
    const accessToken =
      req.headers.authorization?.split(" ")[1] || req.cookies.access_token;
    const refreshToken = req.cookies.refresh_token;

    const nowEpochSeconds = Math.floor(Date.now() / 1000);

    const decodedAccess = accessToken
      ? (jwt.decode(accessToken, { complete: true }) as {
          header?: { kid?: string; alg?: string };
          payload?: JwtPayload;
        } | null)
      : null;

    const payload = decodedAccess?.payload || null;
    const roles = Array.isArray(payload?.realm_access?.roles)
      ? payload?.realm_access?.roles
      : [];

    let verifyResult: {
      valid: boolean;
      error: string | null;
    } = {
      valid: false,
      error: null,
    };

    if (accessToken && decodedAccess?.header?.kid) {
      try {
        const key = await keycloakJwksClient.getSigningKey(decodedAccess.header.kid);
        const signingKey = key.getPublicKey();

        jwt.verify(accessToken, signingKey, {
          algorithms: ["RS256"],
          issuer: `${KEYCLOAK_URL}/realms/${REALM_NAME}`,
        });

        verifyResult = { valid: true, error: null };
      } catch (error: any) {
        verifyResult = {
          valid: false,
          error: error?.name || error?.message || "Token verification failed",
        };
      }
    } else if (accessToken) {
      verifyResult = { valid: false, error: "Missing token kid/header" };
    } else {
      verifyResult = { valid: false, error: "Access token not found" };
    }

    const subject = payload?.sub || null;
    const matchedUser = subject
      ? await prisma.user.findUnique({
          where: { externalId: subject },
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            externalId: true,
            tenant: {
              select: {
                tenantId: true,
                companyName: true,
              },
            },
          },
        })
      : null;

    const expectedRoleRaw =
      typeof req.query.expectedRole === "string" ? req.query.expectedRole : null;
    const expectedRole = expectedRoleRaw ? expectedRoleRaw.trim() : null;

    const isExpired =
      typeof payload?.exp === "number" ? payload.exp <= nowEpochSeconds : null;
    const roleMismatchAgainstDb = Boolean(
      matchedUser?.role && roles.length > 0 && !roles.includes(matchedUser.role)
    );
    const roleMismatchAgainstExpected = Boolean(
      expectedRole && roles.length > 0 && !roles.includes(expectedRole)
    );

    let diagnosis = "OK";
    if (!accessToken) {
      diagnosis = "ACCESS_TOKEN_MISSING";
    } else if (!verifyResult.valid) {
      if (verifyResult.error === "TokenExpiredError" || isExpired === true) {
        diagnosis = "EXPIRED_TOKEN";
      } else {
        diagnosis = "TOKEN_VERIFICATION_FAILED";
      }
    } else if (!matchedUser) {
      diagnosis = "SUB_MISMATCH";
    } else if (roleMismatchAgainstDb || roleMismatchAgainstExpected) {
      diagnosis = "ROLE_MISMATCH";
    }

    const response = {
      debugEnabled: true,
      diagnosis,
      nowEpochSeconds,
      hasAccessToken: Boolean(accessToken),
      hasRefreshToken: Boolean(refreshToken),
      accessToken: {
        iss: payload?.iss || null,
        sub: subject,
        exp: payload?.exp || null,
        iat: payload?.iat || null,
        expired: isExpired,
        roles,
        kid: decodedAccess?.header?.kid || null,
        alg: decodedAccess?.header?.alg || null,
      },
      verification: verifyResult,
      expectedRole,
      dbUserMatch: {
        found: Boolean(matchedUser),
        user: matchedUser,
      },
      roleChecks: {
        dbRole: matchedUser?.role || null,
        tokenHasDbRole: matchedUser?.role ? roles.includes(matchedUser.role) : null,
        tokenHasExpectedRole: expectedRole ? roles.includes(expectedRole) : null,
      },
    };

    res.status(200).json(response);
  } catch (error: any) {
    res.status(500).json({
      message: "Debug token inspection failed",
      error: error?.message || "Unknown error",
    });
  }
};
