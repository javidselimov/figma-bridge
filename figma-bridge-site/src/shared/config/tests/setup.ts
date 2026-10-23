import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

import { resetAllStores } from "@/shared/lib/create-resettable-store";

import { server } from "./msw/server";

// MSW 3: onUnhandledFrame (was onUnhandledRequest) — every request must be mocked
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetAllStores();
  cleanup();
});
afterAll(() => server.close());
