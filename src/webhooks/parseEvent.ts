import type { Request } from "express";
import { RequestValidationError } from "../lib/errors";
import type { ParsedGitHubEvent, SupportedGitHubEvent } from "../types/github";

const supportedEvents = new Set<SupportedGitHubEvent>([
  "workflow_run",
  "release",
  "push",
  "check_suite",
  "check_run",
]);

export function parseGitHubEventRequest(req: Request): ParsedGitHubEvent {
  const event = req.header("x-github-event");
  const deliveryId = req.header("x-github-delivery");

  if (!event || !supportedEvents.has(event as SupportedGitHubEvent)) {
    throw new RequestValidationError("Unsupported or missing GitHub event", "unsupported_event");
  }

  if (!deliveryId) {
    throw new RequestValidationError("Missing GitHub delivery id", "missing_delivery_id");
  }

  const payload = req.body as Record<string, any>;
  const installationId = payload?.installation?.id;
  const repositoryId = payload?.repository?.id;

  if (typeof installationId !== "number") {
    throw new RequestValidationError("Missing GitHub installation id", "missing_installation_id");
  }

  return {
    deliveryId,
    event: event as SupportedGitHubEvent,
    action: typeof payload?.action === "string" ? payload.action : undefined,
    installationId,
    repositoryId: typeof repositoryId === "number" ? repositoryId : undefined,
  };
}
