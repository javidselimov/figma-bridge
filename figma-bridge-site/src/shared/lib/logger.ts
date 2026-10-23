// The only logging API — no console.log elsewhere.
type Ctx = Record<string, string | number | boolean | null>;

const isDev = import.meta.env.DEV;

export const logger = {
  warn: (msg: string, ctx?: Ctx) => {
    if (isDev) console.warn(msg, ctx ?? "");
  },
  error: (err: unknown, ctx?: Ctx) => {
    console.error(err, ctx ?? ""); // replaced by Sentry.captureException when monitoring is on
  },
};
