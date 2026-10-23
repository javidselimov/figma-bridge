const ALLOWED = new Set(["http:", "https:", "mailto:", "tel:"]);

export function safeHref(input: string): string | undefined {
  try {
    const url = new URL(input, "https://placeholder.invalid");
    return ALLOWED.has(url.protocol) ? input : undefined;
  } catch {
    return undefined;
  }
}

/** Open-redirect guard for ?next= / ?returnTo= params: same-origin paths only. */
export function safeRedirect(target: string | null | undefined, fallback = "/"): string {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) {
    return fallback;
  }
  return target;
}
