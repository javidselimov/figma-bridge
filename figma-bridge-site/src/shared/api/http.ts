import axios, { isAxiosError, type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { toast } from "sonner";

import { env } from "@/shared/config/env";

import { ApiError, createApiError } from "./api-error";
import { tokenStorage } from "./token";

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const REFRESH_URL = "/auth/refresh"; // TODO: real refresh endpoint

export const http = axios.create({
  baseURL: env.API_URL,
  withCredentials: true, // send refresh cookie
  timeout: 15_000,
});

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (isAxiosError(error)) {
    return error.response
      ? createApiError(error.response.status, error.response.data, error.message)
      : new ApiError(error.message, null, error.code);
  }
  return new ApiError("Unexpected error", null);
}

http.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  // single-flight: all concurrent 401s await the same promise
  // bare axios (not `http`) → the refresh request never passes through these interceptors
  refreshPromise ??= axios
    .post<{ accessToken: string }>(REFRESH_URL, null, {
      baseURL: env.API_URL,
      withCredentials: true,
    })
    .then(({ data }) => {
      tokenStorage.set(data.accessToken);
      return data.accessToken;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

function rejectWithApiError(error: unknown): Promise<never> {
  const apiError = toApiError(error);
  if (apiError.status !== null && apiError.status >= 500) {
    // the ONLY place a 5xx is toasted; fixed id → Query retries don't stack toasts
    toast.error("Something went wrong on our side. Please try again.", { id: "server-error" });
  }
  return Promise.reject(apiError);
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const isUnauthorized = error.response?.status === 401;
    const isRefreshCall = original?.url?.includes(REFRESH_URL);

    if (!original || !isUnauthorized || isRefreshCall || original._retry) {
      return rejectWithApiError(error);
    }

    original._retry = true;
    try {
      const token = await refreshAccessToken();
      original.headers.Authorization = `Bearer ${token}`;
      return http(original);
    } catch (refreshError) {
      tokenStorage.logout(); // → logout handler: resetAllStores(), queryClient.clear(), redirect
      return Promise.reject(toApiError(refreshError));
    }
  },
);
