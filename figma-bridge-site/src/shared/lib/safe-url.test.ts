import { expect, it } from "vitest";

import { safeHref, safeRedirect } from "./safe-url";

it("blocks javascript: links", () => expect(safeHref("javascript:alert(1)")).toBeUndefined());
it("keeps https links", () => expect(safeHref("https://a.test/x")).toBe("https://a.test/x"));
it("blocks protocol-relative redirects", () => expect(safeRedirect("//evil.test")).toBe("/"));
it("keeps same-origin paths", () => expect(safeRedirect("/account")).toBe("/account"));
