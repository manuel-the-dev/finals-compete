import { z } from "zod";

/**
 * Central, server-side configuration. Secrets are only ever read here and
 * must never be passed to client components or rendered.
 */
const schema = z.object({
  APP_ENV: z.enum(["development", "test", "preview", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  CRON_SECRET: z.string().optional(),
  PUBLIC_BASE_URL: z.string().optional(),

  SOURCE_USER_AGENT: z.string().optional(),

  LIQUIPEDIA_API_KEY: z.string().optional(),
  LIQUIPEDIA_WIKI: z.string().default("thefinals"),

  FACEIT_API_KEY: z.string().optional(),
  FACEIT_CHAMPIONSHIP_IDS: z.string().optional(),

  YOUTUBE_CHANNELS: z.string().optional(),

  TWITCH_CLIENT_ID: z.string().optional(),
  TWITCH_CLIENT_SECRET: z.string().optional(),
  TWITCH_CHANNELS: z.string().optional(),

  X_BEARER_TOKEN: z.string().optional(),
  X_ACCOUNTS: z.string().optional(),
  X_MAX_POSTS_PER_RUN: z.coerce.number().int().positive().default(20),

  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_CHANNELS: z.string().optional(),

  STARTING_BALANCE: z.coerce.number().int().nonnegative().default(1000),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment configuration: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function resetEnvCache() {
  cached = undefined;
}

export function isProduction() {
  return env().APP_ENV === "production";
}

/** Guards scripts that must never touch production data (demo seeds, tests). */
export function assertNotProduction(action: string) {
  if (isProduction()) {
    throw new Error(`Refusing to ${action}: APP_ENV is "production".`);
  }
}

/** Parses "a,b,c" style lists from env vars. */
export function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
