# figma-bridge-site

Website for [figma-bridge](../README.md). Vite + React 19 + TanStack Router/Query + Tailwind v4 + shadcn/ui, Feature-Sliced Design.

```sh
cp .env.example .env.local   # VITE_API_URL
npm install
npm run dev
```

| Script                          | What                                |
| ------------------------------- | ----------------------------------- |
| `dev` / `build` / `preview`     | Vite                                |
| `lint` / `format` / `typecheck` | ESLint, Prettier, `tsc -b`          |
| `test` / `test:coverage`        | Vitest + MSW                        |
| `test:e2e`                      | Playwright (production build) + axe |

Git hooks are installed into the parent repo by `npm install` (`prepare`).
