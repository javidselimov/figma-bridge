import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "./api-error";

const MAX_RETRIES = 2;

function shouldRetry(failureCount: number, error: unknown): boolean {
  // 4xx is a client/business error — retrying cannot fix it
  if (
    error instanceof ApiError &&
    error.status !== null &&
    error.status >= 400 &&
    error.status < 500
  ) {
    return false;
  }
  return failureCount < MAX_RETRIES;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000, // FALLBACK only — every endpoint sets its own policy in its key factory
        gcTime: 5 * 60_000,
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        networkMode: "online",
      },
      mutations: {
        retry: false, // mutations are not idempotent
        networkMode: "online",
      },
    },
  });
}

// One module-level client — shared by the provider, the router context and logout.
export const queryClient = makeQueryClient();
