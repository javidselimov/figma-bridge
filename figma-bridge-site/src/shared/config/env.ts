import { z } from "zod";

// Browser-safe values only: everything VITE_* ships to the client.
const EnvSchema = z.object({ API_URL: z.url() });

export const env = EnvSchema.parse({ API_URL: import.meta.env.VITE_API_URL });
