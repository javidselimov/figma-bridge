import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ReactElement } from "react";

/** Wraps ONLY QueryClientProvider (fresh client per test). Add other providers at the call site. */
export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    user: userEvent.setup(),
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>, options),
  };
}
