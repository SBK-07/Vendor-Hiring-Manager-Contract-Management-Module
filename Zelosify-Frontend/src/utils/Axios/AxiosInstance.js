// src/utils/axiosInstance.js
import axios from "axios";

let authRedirectInProgress = false;
let isRefreshing = false;
let failedQueue = [];

const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";
const AUTH_CONTEXT_KEY = "authContext";

const getAccessToken = () => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
};

const setAccessToken = (token) => {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  }
};

const setRefreshToken = (token) => {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
};

const setAuthContext = (context) => {
  if (typeof window === "undefined") return;
  if (context?.userId && context?.tenantId) {
    localStorage.setItem(AUTH_CONTEXT_KEY, JSON.stringify(context));
  } else {
    localStorage.removeItem(AUTH_CONTEXT_KEY);
  }
};

const clearStoredAuthTokens = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(AUTH_CONTEXT_KEY);
};

const processQueue = (error) => {
  failedQueue.forEach((pending) => {
    if (error) {
      pending.reject(error);
      return;
    }

    pending.resolve(axiosInstance(pending.requestConfig));
  });

  failedQueue = [];
};

const ENABLE_401_AUTO_REDIRECT =
  process.env.NEXT_PUBLIC_ENABLE_401_REDIRECT === "true";

const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL,
  withCredentials: true,
});

const refreshClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL,
  withCredentials: true,
});

// Add request interceptor for logging
axiosInstance.interceptors.request.use(
  (config) => {
    const accessToken = getAccessToken();
    if (accessToken) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    // console.log(`API Request: ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  async (error) => {
    console.error("API Request Error:", error);
    return Promise.reject(error);
  }
);

// Add response interceptor for logging
axiosInstance.interceptors.response.use(
  (response) => {
    console.log(
      `API Response [${
        response.status
      }]: ${response.config.method.toUpperCase()} ${response.config.url}`
    );
    return response;
  },
  async (error) => {
    if (error.response) {
      const status = error.response.status;
      const method = error.config?.method?.toUpperCase?.() || "GET";
      const url = error.config?.url || "";
      const originalRequest = error.config;

      if (status === 401) {
        console.warn(`API Unauthorized [401]: ${method} ${url}`);

        const isAuthEndpoint =
          url.includes("/auth/verify-login") ||
          url.includes("/auth/verify-totp") ||
          url.includes("/auth/logout") ||
          url.includes("/auth/refresh-token");

        if (!isAuthEndpoint && !originalRequest?._retry) {
          originalRequest._retry = true;

          if (isRefreshing) {
            return new Promise((resolve, reject) => {
              failedQueue.push({
                resolve,
                reject,
                requestConfig: originalRequest,
              });
            });
          }

          isRefreshing = true;

          try {
            const refreshResponse = await refreshClient.post("/auth/refresh-token");
            const newAccessToken = refreshResponse.data?.accessToken || null;

            if (!newAccessToken) {
              throw new Error("Missing access token in refresh response");
            }

            setAccessToken(newAccessToken);
            setRefreshToken(refreshResponse.data?.refreshToken || null);
            setAuthContext(refreshResponse.data?.authContext || null);

            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

            if (typeof window !== "undefined") {
              try {
                const profileResponse = await axiosInstance.get("/auth/user");
                localStorage.setItem(
                  "zelosify_user",
                  JSON.stringify(profileResponse.data)
                );
              } catch {
                // Keep request retry working even if profile hydration fails.
              }
            }

            processQueue(null);
            return axiosInstance(originalRequest);
          } catch (refreshError) {
            processQueue(refreshError);

            if (typeof window !== "undefined") {
              try {
                localStorage.removeItem("zelosify_user");
                clearStoredAuthTokens();
              } catch {
                // Ignore storage failures.
              }
            }

            if (ENABLE_401_AUTO_REDIRECT && typeof window !== "undefined") {
              window.location.replace("/login?reason=expired");
            }

            return Promise.reject(refreshError);
          } finally {
            isRefreshing = false;
          }
        }

        if (!ENABLE_401_AUTO_REDIRECT) {
          return Promise.reject(error);
        }

        if (!isAuthEndpoint && typeof window !== "undefined" && !authRedirectInProgress) {
          const currentPath = window.location.pathname;
          const isAlreadyOnAuthPage =
            currentPath === "/login" ||
            currentPath === "/register" ||
            currentPath === "/setup-totp";

          if (isAlreadyOnAuthPage) {
            return Promise.reject(error);
          }

          const now = Date.now();
          const lastRedirectAt = Number(
            window.sessionStorage.getItem("auth_redirect_last_ts") || "0"
          );

          // Avoid repeated hard redirects while the app settles after token expiry.
          if (now - lastRedirectAt < 1500) {
            return Promise.reject(error);
          }

          authRedirectInProgress = true;
          window.sessionStorage.setItem("auth_redirect_last_ts", String(now));

          try {
            localStorage.removeItem("zelosify_user");
            clearStoredAuthTokens();
          } catch {
            // Ignore storage failures.
          }

          window.location.replace("/login?reason=expired");
        }
      } else {
        console.error(
          `API Error [${status}]: ${method} ${url}`,
          error.response.data
        );
      }
    } else {
      console.error(`API Error: ${error.message}`);
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
export { setAccessToken, setRefreshToken, setAuthContext, clearStoredAuthTokens };
