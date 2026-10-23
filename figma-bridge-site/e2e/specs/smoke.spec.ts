import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "../a11y.ts";

// Every top-level route: renders, no console errors, axe clean.
for (const path of ["/"]) {
  test(`${path} renders cleanly and is accessible`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    await expectNoA11yViolations(page);
    expect(errors).toEqual([]);
  });
}
