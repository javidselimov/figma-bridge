import { QueryProvider } from "./QueryProvider";
import { ThemeProvider } from "./ThemeProvider";

import type { ReactNode } from "react";

export type ProvidersProps = { children: ReactNode };

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider>
      <QueryProvider>{children}</QueryProvider>
    </ThemeProvider>
  );
}
