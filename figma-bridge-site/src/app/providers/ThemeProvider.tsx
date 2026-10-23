import { ThemeProvider as NextThemesProvider } from "next-themes";

import type { ReactNode } from "react";

export type ThemeProviderProps = { children: ReactNode };

// `.dark` class on <html> drives the shadcn tokens; forced dark to match the terminal palette.
export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider attribute="class" forcedTheme="dark" disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
