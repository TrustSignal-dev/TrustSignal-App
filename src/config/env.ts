import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  GITHUB_APP_ID: z.string().min(1, "GITHUB_APP_ID is required"),
  GITHUB_APP_NAME: z.string().min(1, "GITHUB_APP_NAME is required"),
  GITHUB_WEBHOOK_SECRET: z.string().min(1, "GITHUB_WEBHOOK_SECRET is required"),
  GITHUB_PRIVATE_KEY: z.string().optional(),
  GITHUB_PRIVATE_KEY_PEM: z.string().optional(),
  GITHUB_API_BASE_URL: z.string().url("GITHUB_API_BASE_URL must be a valid URL").optional(),
  GITHUB_GRAPHQL_BASE_URL: z.string().url("GITHUB_GRAPHQL_BASE_URL must be a valid URL").optional(),
  GITHUB_WEB_BASE_URL: z.string().url("GITHUB_WEB_BASE_URL must be a valid URL").optional(),
  TRUSTSIGNAL_API_BASE_URL: z.string().url("TRUSTSIGNAL_API_BASE_URL must be a valid URL"),
  TRUSTSIGNAL_API_KEY: z.string().min(1, "TRUSTSIGNAL_API_KEY is required"),
  INTERNAL_API_KEY: z.string().min(1, "INTERNAL_API_KEY is required"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

type ParsedEnv = z.infer<typeof envSchema>;

export interface AppEnv extends Omit<ParsedEnv, "GITHUB_PRIVATE_KEY" | "GITHUB_PRIVATE_KEY_PEM"> {
  GITHUB_PRIVATE_KEY: string;
  GITHUB_PRIVATE_KEY_PEM: string;
}

export function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n").trim();
}

export function parseEnv(input: NodeJS.ProcessEnv): AppEnv {
  const parsed = envSchema.parse(input);
  const privateKey = parsed.GITHUB_PRIVATE_KEY_PEM || parsed.GITHUB_PRIVATE_KEY;

  if (!privateKey) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ["GITHUB_PRIVATE_KEY_PEM"],
        message: "GITHUB_PRIVATE_KEY_PEM is required",
      },
    ]);
  }

  const normalizedKey = normalizePrivateKey(privateKey);

  return {
    ...parsed,
    GITHUB_PRIVATE_KEY: normalizedKey,
    GITHUB_PRIVATE_KEY_PEM: normalizedKey,
  };
}

let cachedEnv: AppEnv | null = null;

export function loadEnv() {
  if (!cachedEnv) {
    cachedEnv = parseEnv(process.env);
  }

  return cachedEnv;
}

export function resetEnvCache() {
  cachedEnv = null;
}
