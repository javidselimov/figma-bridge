import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

type Options = { include?: string; exclude?: string[]; disableRules?: string[] };

export async function expectNoA11yViolations(page: Page, opts: Options = {}) {
  let builder = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
    "wcag22aa",
  ]);
  if (opts.include) builder = builder.include(opts.include);
  for (const sel of opts.exclude ?? []) builder = builder.exclude(sel);
  if (opts.disableRules?.length) builder = builder.disableRules(opts.disableRules);

  const { violations } = await builder.analyze();
  const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = blocking.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length} nodes)`);
  expect(report, "serious/critical a11y violations").toEqual([]);
}
