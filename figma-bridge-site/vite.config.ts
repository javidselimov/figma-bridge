import path from "node:path";

import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

// Production-only CSP <meta> (dev HMR needs inline scripts). Prefer setting CSP +
// security headers at the host/CDN — security.md §1-2; then delete this plugin.
function cspMeta(apiUrl: string): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    `connect-src 'self' ${new URL(apiUrl).origin}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
  return {
    name: "csp-meta",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: csp },
        injectTo: "head-prepend",
      },
    ],
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    plugins: [
      tanstackRouter({ target: "react", autoCodeSplitting: true }), // must be before react()
      react(),
      babel({ presets: [reactCompilerPreset()] }), // plugin-react 6: React Compiler via Babel preset
      tailwindcss(),
      cspMeta(env.VITE_API_URL ?? "http://localhost:8080"),
    ],
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  };
});
