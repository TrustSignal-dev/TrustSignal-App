import { Router } from "express";
import type { AppEnv } from "../config/env";

export function createHealthRouter(env: Pick<AppEnv, "NODE_ENV" | "GITHUB_APP_NAME">) {
  const router = Router();
  const buildSha = process.env.GIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "unknown";
  const buildTime = process.env.BUILD_TIME || process.env.BUILD_TIMESTAMP || "unknown";
  const version = process.env.npm_package_version || "0.1.0";

  router.get("/", (_req, res) => {
    res.status(200).json({
      service: "TrustSignal GitHub App",
      app: env.GITHUB_APP_NAME,
      status: "ready",
      docs: {
        health: "/health",
        webhook: "/webhooks/github",
      },
    });
  });

  router.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "trustsignal-github-app",
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      gitSha: buildSha,
      buildTime,
      version,
    });
  });

  router.get("/version", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "trustsignal-github-app",
      version,
      gitSha: buildSha,
      buildTime,
      environment: env.NODE_ENV,
    });
  });

  return router;
}
