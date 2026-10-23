import pluginQuery from "@tanstack/eslint-plugin-query";
import pluginRouter from "@tanstack/eslint-plugin-router";
import prettier from "eslint-config-prettier";
import boundaries from "eslint-plugin-boundaries";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import unusedImports from "eslint-plugin-unused-imports";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const appFiles = ["src/**/*.{ts,tsx}"];

// FSD: a layer may import only the listed layers (eslint-plugin-boundaries v7 policy syntax)
const layer = (from, to) => ({
  from: { element: { type: from } },
  allow: { to: { element: { types: { anyOf: to } } } },
});

export default defineConfig(
  globalIgnores([
    "dist/**",
    "node_modules/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "src/shared/ui/**", // shadcn sources
    "src/routeTree.gen.ts",
  ]),
  tseslint.configs.recommended,
  pluginQuery.configs["flat/recommended"],
  pluginRouter.configs["flat/recommended"],
  {
    files: appFiles,
    extends: [
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: {
      boundaries,
      import: importPlugin,
      "react-refresh": reactRefresh,
      "unused-imports": unusedImports,
    },
    settings: {
      "import/resolver": { typescript: true, node: true },
      "import/internal-regex": "^@/",
      "boundaries/elements": [
        { type: "app", pattern: "src/app/*" },
        { type: "routes", pattern: "src/routes/*" },
        { type: "views", pattern: "src/views/*", capture: ["slice"] },
        { type: "widgets", pattern: "src/widgets/*", capture: ["slice"] },
        { type: "features", pattern: "src/features/*", capture: ["slice"] },
        { type: "entities", pattern: "src/entities/*", capture: ["slice"] },
        { type: "shared", pattern: "src/shared/*" },
      ],
    },
    rules: {
      "react-hooks/exhaustive-deps": "error",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_" },
      ],

      "import/order": [
        "warn",
        {
          groups: ["builtin", "external", "internal", ["parent", "sibling"], "index", "type"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import/no-duplicates": ["error", { "prefer-inline": true }],

      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "no-var": "error",
      "no-debugger": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],

      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "axios", message: "Use http from @/shared/api" }],
          patterns: [
            {
              group: ["@/views/*/*", "@/widgets/*/*", "@/features/*/*", "@/entities/*/*"],
              message: "Import slices only through their public API (index.ts)",
            },
          ],
        },
      ],
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            layer("routes", ["views", "app", "shared"]),
            layer("app", ["routes", "views", "widgets", "features", "entities", "shared"]),
            layer("views", ["widgets", "features", "entities", "shared"]),
            layer("widgets", ["features", "entities", "shared"]),
            layer("features", ["entities", "shared"]),
            layer("entities", ["shared"]),
            layer("shared", ["shared"]),
          ],
        },
      ],
    },
  },
  {
    files: ["src/shared/api/**"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // route files export `Route`, not a component — Fast Refresh rule doesn't apply
    files: ["src/routes/**"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    files: ["**/*.tsx"],
    ignores: ["**/*.test.tsx"],
    rules: { "max-lines": ["error", { max: 150, skipBlankLines: true, skipComments: true }] },
  },
  prettier,
);
