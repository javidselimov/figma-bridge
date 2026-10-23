import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true }, // Vite 8 native — replaces vite-tsconfig-paths
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/shared/config/tests/setup.ts"],
    css: false,
    // same origin as jsdom (localhost:3000): jsdom enforces CORS on XHR, MSW responses have no CORS headers
    env: { VITE_API_URL: "http://localhost:3000/api" },
    exclude: [...configDefaults.exclude, "e2e/**"], // Playwright specs are not Vitest tests
    coverage: {
      provider: "v8",
      include: ["src/features/**", "src/entities/**", "src/shared/lib/**", "src/shared/api/**"],
      thresholds: { lines: 80 },
    },
  },
});
