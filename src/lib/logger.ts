import pino from "pino";
import type { AppEnv } from "../config/env";

export function createLogger(env: Pick<AppEnv, "LOG_LEVEL">) {
  return pino({
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.x-api-key",
        "headers.authorization",
        "headers.x-api-key",
        "apiKey",
        "privateKey",
        "token",
      ],
      remove: true,
    },
  });
}
