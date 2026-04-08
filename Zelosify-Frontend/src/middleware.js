import { NextResponse } from "next/server";
import { extractRoleFromToken, isTokenExpired } from "@/utils/Auth/middlewareUtils";

const roleHomeRouteMap = {
  IT_VENDOR: "/vendor/openings",
  HIRING_MANAGER: "/hiring-manager/openings",
  BUSINESS_USER: "/business-user/digital-initiative",
  VENDOR_MANAGER: "/user",
};

export function middleware(request) {
  // Get the pathname of the request
  const path = request.nextUrl.pathname;
  const loginReason = request.nextUrl.searchParams.get("reason");
  const isExpiredSessionRecovery = path === "/login" && loginReason === "expired";

  // Define public paths that don't require authentication
  const isPublicPath =
    path === "/login" ||
    path === "/register" ||
    path === "/setup-totp" ||
    path.startsWith("/api/");

  // Check if we have auth cookies
  const accessToken = request.cookies.get("access_token")?.value;
  const refreshToken = request.cookies.get("refresh_token")?.value;
  const registrationToken = request.cookies.get("registration_token")?.value;

  const hasAccessToken = !!accessToken;
  const hasRefreshToken = !!refreshToken;
  const hasValidAccessToken = hasAccessToken && !isTokenExpired(accessToken);

  // A user is considered authenticated only if access token is still valid and refresh token exists.
  const isAuthenticated = hasValidAccessToken && hasRefreshToken;
  // A user is in registration process if they have the special token
  const isRegistering = !!registrationToken;

  // Extract role from access token and set it in a readable cookie
  const response = NextResponse.next();
  let userRole = null;

  // If stale auth cookies exist, clear them so public pages remain reachable.
  if ((hasAccessToken || hasRefreshToken) && !isAuthenticated) {
    response.cookies.delete("access_token");
    response.cookies.delete("refresh_token");
    response.cookies.delete("role");
  }

  if (isAuthenticated && accessToken) {
    userRole = extractRoleFromToken(accessToken);

    if (userRole) {
      // Set role cookie that JavaScript can read (non-HTTP-only)
      response.cookies.set("role", userRole, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24, // 24 hours
      });
    } else {
      // Clear role cookie if no valid role found
      response.cookies.delete("role");
    }
  } else if (!isAuthenticated) {
    // Clear role cookie when not authenticated
    response.cookies.delete("role");
  }

  // Special case: Registration flow
  if (isRegistering) {
    // If user has registration token, they must complete TOTP setup
    if (path !== "/setup-totp") {
      return NextResponse.redirect(new URL("/setup-totp", request.url));
    }
    return response;
  }

  // Redirect logged in users away from public pages except during registration
  if (isPublicPath && isAuthenticated && !isExpiredSessionRecovery) {
    // Role-based redirection
    console.log("User Role = ", userRole);
    switch (userRole) {
      case "VENDOR_MANAGER":
        console.log(`Redirecting VENDOR_MANAGER to /user`);
        return NextResponse.redirect(new URL("/user", request.url));

      case "BUSINESS_USER":
        console.log(
          `Redirecting BUSINESS_USER to /business-user/digital-initiative`
        );
        return NextResponse.redirect(
          new URL("/business-user/digital-initiative", request.url)
        );

      case "IT_VENDOR":
        console.log(`Redirecting IT_VENDOR to /vendor/openings`);
        return NextResponse.redirect(new URL("/vendor/openings", request.url));

      case "HIRING_MANAGER":
        console.log(`Redirecting HIRING_MANAGER to /hiring-manager/openings`);
        return NextResponse.redirect(
          new URL("/hiring-manager/openings", request.url)
        );

      default:
        // Fallback for unknown roles or missing role - redirect to base user page
        console.log(`Unknown role (${userRole}) - redirecting to /`);
        return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // Redirect unauthenticated users to login page
  if (!isPublicPath && !isAuthenticated) {
    const redirectResponse = NextResponse.redirect(new URL("/login", request.url));

    if (hasAccessToken || hasRefreshToken) {
      redirectResponse.cookies.delete("access_token");
      redirectResponse.cookies.delete("refresh_token");
      redirectResponse.cookies.delete("role");
    }

    return redirectResponse;
  }

  // Strong role-based route guard for authenticated users.
  if (!isPublicPath && isAuthenticated && userRole) {
    if (path.startsWith("/vendor") && userRole !== "IT_VENDOR") {
      const redirectPath = roleHomeRouteMap[userRole] || "/";
      return NextResponse.redirect(new URL(redirectPath, request.url));
    }

    if (path.startsWith("/hiring-manager") && userRole !== "HIRING_MANAGER") {
      const redirectPath = roleHomeRouteMap[userRole] || "/";
      return NextResponse.redirect(new URL(redirectPath, request.url));
    }

    if (path.startsWith("/business-user") && userRole !== "BUSINESS_USER") {
      const redirectPath = roleHomeRouteMap[userRole] || "/";
      return NextResponse.redirect(new URL(redirectPath, request.url));
    }

    if (path.startsWith("/user") && userRole === "IT_VENDOR") {
      return NextResponse.redirect(new URL("/vendor/openings", request.url));
    }
  }

  return response;
}

// Configure middleware to run only on specific paths
export const config = {
  matcher: [
    // Protected routes
    "/user/:path*",
    "/vendor/:path*",
    "/hiring-manager/:path*",
    "/business-user/:path*",

    // Public paths for redirect logic
    "/login",
    "/register",
    "/setup-totp",
  ],
};
