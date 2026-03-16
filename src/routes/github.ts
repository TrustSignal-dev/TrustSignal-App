import crypto from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Logger } from "pino";
import { z } from "zod";
import { publishCheckRun } from "../checks/publishCheckRun";
import type { AppEnv } from "../config/env";
import type { GitHubApiClient } from "../github/client";
import { AuthenticationError } from "../lib/errors";
import type { VerificationCheckConclusion, VerificationCheckStatus } from "../types/github";

const checkRunSchema = z.object({
  installationId: z.number().int().positive(),
  owner: z.string().min(1),
  repo: z.string().min(1),
  headSha: z.string().min(7).max(64),
  checkRunId: z.number().int().positive().optional(),
  status: z.enum(["queued", "in_progress", "completed"]),
  conclusion: z.enum(["success", "failure", "neutral"]).optional(),
  externalId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  detailsUrl: z.string().url().optional(),
  receiptId: z.string().optional(),
  verificationTimestamp: z.string().datetime({ offset: true }),
  provenanceNote: z.string().min(1),
}).superRefine((value, ctx) => {
  if (value.status === "completed" && !value.conclusion) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["conclusion"],
      message: "conclusion is required when status is completed",
    });
  }

  if (value.status !== "completed" && value.conclusion) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["conclusion"],
      message: "conclusion is only allowed when status is completed",
    });
  }
});

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function createInternalApiKeyMiddleware(expected: string) {
  const expectedTokens = expected
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return (req: Request, _res: Response, next: NextFunction) => {
    const header = (req.header("authorization") || req.header("x-api-key") || "").trim();
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : header;

    const isAuthorized = token && expectedTokens.some((expectedToken) => safeEqual(token, expectedToken));

    if (!isAuthorized) {
      next(new AuthenticationError());
      return;
    }

    next();
  };
}

export function createGitHubRouter({
  env,
  githubClient,
  logger,
}: {
  env: Pick<AppEnv, "INTERNAL_API_KEY">;
  githubClient: GitHubApiClient;
  logger: Logger;
}) {
  const router = Router();
  const internalOnly = createInternalApiKeyMiddleware(env.INTERNAL_API_KEY);

  router.get("/github/installations", internalOnly, async (_req, res, next) => {
    try {
      const installations = await githubClient.listInstallations();
      res.status(200).json({ installations });
    } catch (error) {
      next(error);
    }
  });

  router.post("/github/check-run", internalOnly, async (req, res, next) => {
    try {
      const body = checkRunSchema.parse(req.body);
      const result = await publishCheckRun(githubClient, body) as {
        id: number;
        html_url?: string;
        status?: VerificationCheckStatus;
        conclusion?: VerificationCheckConclusion;
      };
      res.status(200).json({
        id: result.id,
        htmlUrl: result.html_url,
        status: result.status,
        conclusion: result.conclusion,
      });
    } catch (error) {
      logger.warn({ err: error }, "manual check-run request failed");
      next(error);
    }
  });

  return router;
}
