import { ThemeProvider as NextThemesProvider } from "next-themes";

import type { ReactNode } from "react";

export type ThemeProviderProps = { children: ReactNode };

// `.dark` class on <html> drives the shadcn tokens; follows the OS until the user picks a theme.
export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
