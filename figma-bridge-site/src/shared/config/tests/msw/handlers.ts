import type { RequestHandler } from "msw";

// Every slice appends its default handlers here; per-test overrides use server.use(...).
export const handlers: RequestHandler[] = [];
