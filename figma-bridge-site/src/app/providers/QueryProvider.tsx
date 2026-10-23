import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "@/shared/api/query-client";

import type { ReactNode } from "react";

export type QueryProviderProps = { children: ReactNode };

export function QueryProvider({ children }: QueryProviderProps) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
