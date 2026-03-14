import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { Server } from "node:http";
import type { Logger } from "pino";
import { ZodError } from "zod";
import { loadEnv, type AppEnv } from "./config/env";
import { GitHubAppAuth } from "./github/auth";
import { GitHubApiClient } from "./github/client";
import { AppError, ConflictError, RequestValidationError } from "./lib/errors";
import { createLogger } from "./lib/logger";
import { ReplayStore } from "./lib/replayStore";
import { createGitHubRouter } from "./routes/github";
import { createHealthRouter } from "./routes/health";
import { handleGitHubWebhook } from "./webhooks/github";
import { parseGitHubEventRequest } from "./webhooks/parseEvent";
import { verifyGitHubWebhookSignature } from "./webhooks/verifySignature";
import { TrustSignalApiVerificationService, type TrustSignalVerificationService } from "./verification/verifyArtifact";

export interface AppServices {
  env: AppEnv;
  logger: Logger;
  replayStore: ReplayStore;
  githubClient: GitHubApiClient;
  verificationService: TrustSignalVerificationService;
}

function createRequestId() {
  return crypto.randomUUID();
}

export function createGitHubWebhookHandler(services: AppServices) {
  return async (req: Request, res: Response, next: NextFunction) => {
    let deliveryId: string | null = null;
    let deliveryStarted = false;

    try {
      if (!req.is("application/json")) {
        throw new RequestValidationError("Content-Type must be application/json", "invalid_content_type");
      }

      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
      const signature = req.header("x-hub-signature-256");

      if (!verifyGitHubWebhookSignature(services.env.GITHUB_WEBHOOK_SECRET, rawBody, signature)) {
        res.status(signature ? 401 : 403).json({ error: signature ? "Invalid signature" : "Missing signature" });
        return;
      }

      let parsedBody: Record<string, any>;
      try {
        parsedBody = JSON.parse(rawBody.toString("utf8")) as Record<string, any>;
      } catch {
        throw new RequestValidationError("Invalid JSON payload", "invalid_json");
      }

      req.body = parsedBody;

      const parsedEvent = parseGitHubEventRequest(req);
      deliveryId = parsedEvent.deliveryId;
      const replayStatus = services.replayStore.begin(parsedEvent.deliveryId);
      if (replayStatus === "completed") {
        throw new ConflictError("Replay detected", "replay_detected");
      }
      if (replayStatus === "in_flight") {
        throw new ConflictError("Delivery already in progress", "delivery_in_progress");
      }
      deliveryStarted = true;

      const result = await handleGitHubWebhook({
        parsed: parsedEvent,
        payload: parsedBody,
        githubClient: services.githubClient,
        verificationService: services.verificationService,
        logger: services.logger,
        appName: services.env.GITHUB_APP_NAME,
      });

      services.replayStore.complete(parsedEvent.deliveryId);
      res.status(202).json(result);
    } catch (error) {
      if (deliveryStarted && deliveryId) {
        services.replayStore.release(deliveryId);
      }
      next(error);
    }
  };
}

export function createApp(services: AppServices) {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use((req, _res, next) => {
    req.headers["x-request-id"] = req.header("x-request-id") || createRequestId();
    next();
  });
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      services.logger.info(
        {
          requestId: req.header("x-request-id"),
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
        },
        "request completed"
      );
    });
    next();
  });
  app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
  app.use(createHealthRouter(services.env));
  app.post("/webhooks/github", express.raw({ type: "application/json", limit: "256kb" }), createGitHubWebhookHandler(services));
  app.use(express.json({ limit: "100kb" }));
  app.use(createGitHubRouter({ env: services.env, githubClient: services.githubClient, logger: services.logger }));
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const requestId = req.header("x-request-id");

    if (error instanceof AppError) {
      services.logger.warn({ requestId, code: error.code, err: error.message }, "request rejected");
      res.status(error.statusCode).json({ error: error.message, code: error.code, requestId });
      return;
    }

    if (error instanceof ZodError) {
      services.logger.warn({ requestId, issues: error.issues }, "request validation failed");
      res.status(400).json({ error: "Invalid request", requestId });
      return;
    }

    if (isBodyParserError(error)) {
      const statusCode = error.type === "entity.too.large" ? 413 : 400;
      services.logger.warn({ requestId, err: error.message, type: error.type }, "request body rejected");
      res.status(statusCode).json({ error: statusCode === 413 ? "Request body too large" : "Invalid JSON", requestId });
      return;
    }

    services.logger.error({ requestId, err: error }, "request failed");
    res.status(500).json({ error: "Internal server error", requestId });
  });

  return app;
}

export function createServices(env = loadEnv()) {
  const logger = createLogger(env);
  const replayStore = new ReplayStore();
  const auth = new GitHubAppAuth(env);
  const githubClient = new GitHubApiClient(env, auth);
  const verificationService = new TrustSignalApiVerificationService(env);

  return {
    env,
    logger,
    replayStore,
    githubClient,
    verificationService,
  };
}

export async function startServer() {
  const services = createServices();
  const app = createApp(services);
  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(services.env.PORT, () => {
      services.logger.info({ port: services.env.PORT }, "trustsignal github app listening");
      resolve(instance);
    });
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    services.logger.info("shutting down");
    server.close();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    const logger = createLogger({ LOG_LEVEL: process.env.LOG_LEVEL === "debug" ? "debug" : "info" });
    logger.error({ err: error }, "failed to start server");
    process.exit(1);
  });
}

function isBodyParserError(error: unknown): error is { type?: string; message: string } {
  return typeof error === "object" && error !== null && "message" in error && "type" in error;
}
