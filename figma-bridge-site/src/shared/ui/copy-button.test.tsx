import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/shared/config/tests/render";

import { CopyButton } from "./copy-button";

describe("CopyButton", () => {
  it("copies the value and confirms with a Copied label", async () => {
    const { user } = renderWithProviders(<CopyButton value="npx some-command" />);

    await user.click(screen.getByRole("button", { name: "Copy to clipboard" }));

    await expect(navigator.clipboard.readText()).resolves.toBe("npx some-command");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});
