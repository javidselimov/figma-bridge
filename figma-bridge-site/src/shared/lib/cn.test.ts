import { expect, it } from "vitest";

import { cn } from "./cn";

it("joins conditional classes", () => {
  const isActive = false;
  expect(cn("px-2", isActive && "hidden", "text-sm")).toBe("px-2 text-sm");
});

it("lets the later Tailwind class win on conflicts", () => {
  expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
});
