import type { Logger } from "pino";
import type { GitHubApiClient } from "../github/client";
import { publishCheckRun } from "../checks/publishCheckRun";
import type { ParsedGitHubEvent } from "../types/github";
import type { TrustSignalVerificationService } from "../verification/verifyArtifact";
import { normalizeCheckRunEvent } from "./handlers/checkRun";
import { normalizeCheckSuiteEvent } from "./handlers/checkSuite";
import { normalizePushEvent } from "./handlers/push";
import { normalizeReleaseEvent } from "./handlers/release";
import { normalizeWorkflowRunEvent } from "./handlers/workflowRun";

interface HandleWebhookInput {
  parsed: ParsedGitHubEvent;
  payload: Record<string, any>;
  githubClient: GitHubApiClient;
  verificationService: TrustSignalVerificationService;
  logger: Logger;
  appName: string;
}

interface GitHubResourcePayload {
  id?: number;
  target_commitish?: string;
  sha?: string;
  status?: string;
  conclusion?: string;
  head_sha?: string;
  html_url?: string;
  name?: string;
  event?: string;
}

interface GitHubCheckRunResult {
  id: number;
}

interface WebhookTraceContext {
  deliveryId: string;
  phase:
    | "received"
    | "ignored"
    | "check_run_start"
    | "verification_started"
    | "verification_finished"
    | "check_run_complete"
    | "check_run_failover_start"
    | "check_run_failover_complete"
    | "error";
  event: string;
  action?: string;
  installationId: number;
  repository?: string;
  checkSuiteId?: string;
  checkRunId?: number;
  headSha?: string;
  error?: string;
}

function toRepositoryFullName(payload: Record<string, any>) {
  const owner = payload?.repository?.owner?.login || payload?.repository?.owner?.name;
  const repo = payload?.repository?.name;
  if (!owner || !repo) return undefined;
  return `${owner}/${repo}`;
}

function toCheckSuiteId(payload: Record<string, any>) {
  if (payload?.check_suite?.id != null) {
    return `check_suite:${payload.check_suite.id}`;
  }

  return undefined;
}

function errorSummary(error: unknown) {
  if (error instanceof Error) {
    return error.message || "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function failureCheckRunPayload(input: {
  installationId: number;
  owner: string;
  repo: string;
  headSha: string;
  externalId: string;
  detailsUrl?: string;
  checkRunId: number;
  verificationTimestamp: string;
  phase: string;
  error: string;
  provenanceNote: string;
}) {
  return {
    installationId: input.installationId,
    owner: input.owner,
    repo: input.repo,
    headSha: input.headSha,
    checkRunId: input.checkRunId,
    status: "completed" as const,
    conclusion: "failure" as const,
    externalId: input.externalId,
    title: "Verification failed",
    summary: `TrustSignal failed while ${input.phase}: ${input.error}.`,
    detailsUrl: input.detailsUrl,
    verificationTimestamp: input.verificationTimestamp,
    provenanceNote: input.provenanceNote,
  };
}

export async function handleGitHubWebhook(input: HandleWebhookInput) {
  const repository = toRepositoryFullName(input.payload);
  const trace: WebhookTraceContext = {
    deliveryId: input.parsed.deliveryId,
    installationId: input.parsed.installationId,
    event: input.parsed.event,
    action: input.parsed.action,
    repository,
    checkSuiteId: toCheckSuiteId(input.payload),
    phase: "received",
  };

  input.logger.info(trace, "github webhook received");

  const base = {
    deliveryId: input.parsed.deliveryId,
    installationId: input.parsed.installationId,
    payload: input.payload,
  };

  let verificationJob = null;
  let startedCheckRunId: number | null = null;

  try {
    switch (input.parsed.event) {
      case "workflow_run":
        verificationJob = await buildWorkflowRunJob(input, base);
        break;
      case "release":
        verificationJob = await buildReleaseJob(input, base);
        break;
      case "push":
        verificationJob = normalizePushEvent(base);
        break;
      case "check_suite":
        verificationJob = normalizeCheckSuiteEvent({
          action: input.parsed.action,
          payload: input.payload,
          deliveryId: input.parsed.deliveryId,
          installationId: input.parsed.installationId,
        });
        break;
      case "check_run":
        normalizeCheckRunEvent(input.payload, input.appName);
        break;
    }

    if (!verificationJob) {
      input.logger.info(
        {
          ...trace,
          phase: "ignored",
          repository: repository,
          checkSuiteId: toCheckSuiteId(input.payload),
        },
        "github event ignored"
      );

      return { accepted: true, ignored: true };
    }

    trace.repository = `${verificationJob.repository.owner}/${verificationJob.repository.repo}`;
    trace.phase = "check_run_start";
    const startedCheckRun = (await publishCheckRun(input.githubClient, {
      installationId: verificationJob.installationId,
      owner: verificationJob.repository.owner,
      repo: verificationJob.repository.repo,
      headSha: verificationJob.headSha,
      status: "in_progress",
      externalId: verificationJob.externalId,
      title: "Verification started",
      summary: `TrustSignal accepted ${verificationJob.summaryContext}.`,
      verificationTimestamp: new Date().toISOString(),
      provenanceNote: `Accepted via ${verificationJob.eventName}`,
      detailsUrl: verificationJob.detailsUrl,
    })) as GitHubCheckRunResult;

    startedCheckRunId = startedCheckRun.id;
    trace.checkRunId = startedCheckRun.id;
    trace.headSha = verificationJob.headSha;
    input.logger.info(trace, "check run started");

    trace.phase = "verification_started";
    const verificationResult = await input.verificationService.verify(verificationJob);

    trace.phase = "verification_finished";
    input.logger.info(
      {
        ...trace,
        conclusion: verificationResult.conclusion,
        status: verificationResult.status,
      },
      "verification finished"
    );

    trace.phase = "check_run_complete";
    await publishCheckRun(input.githubClient, {
      installationId: verificationJob.installationId,
      owner: verificationJob.repository.owner,
      repo: verificationJob.repository.repo,
      headSha: verificationJob.headSha,
      checkRunId: startedCheckRun.id,
      status: verificationResult.status,
      conclusion: verificationResult.conclusion,
      externalId: verificationJob.externalId,
      title: verificationResult.title,
      summary: verificationResult.summary,
      verificationTimestamp: verificationResult.verificationTimestamp,
      provenanceNote: verificationResult.provenanceNote,
      detailsUrl: verificationResult.detailsUrl,
      receiptId: verificationResult.receiptId,
    });

    input.logger.info(
      {
        ...trace,
        phase: "check_run_complete",
        checkRunId: startedCheckRun.id,
        status: verificationResult.status,
        conclusion: verificationResult.conclusion,
        githubEnterpriseVersion: verificationJob.githubEnterpriseVersion,
        receiptId: verificationResult.receiptId,
      },
      "github event processed"
    );

    return { accepted: true, ignored: false, receiptId: verificationResult.receiptId };
  } catch (err) {
    const failurePhase = trace.phase;
    const failedError = errorSummary(err);
    input.logger.error(
      {
        ...trace,
        phase: "error",
        error: failedError,
      },
      "github webhook processing failed"
    );

    if (startedCheckRunId && verificationJob) {
      input.logger.info(
        {
          ...trace,
          phase: "check_run_failover_start",
          checkRunId: startedCheckRunId,
          checkSuiteId: verificationJob.eventName === "check_suite" ? verificationJob.externalId : trace.checkSuiteId,
        },
        "publishing failure check run"
      );

      try {
        await publishCheckRun(
          input.githubClient,
          failureCheckRunPayload({
            installationId: verificationJob.installationId,
            owner: verificationJob.repository.owner,
            repo: verificationJob.repository.repo,
            headSha: verificationJob.headSha,
            externalId: verificationJob.externalId,
            detailsUrl: verificationJob.detailsUrl,
            checkRunId: startedCheckRunId,
            verificationTimestamp: new Date().toISOString(),
            phase: failurePhase,
            error: failedError,
            provenanceNote: `Failure from ${failurePhase}`,
          })
        );

        input.logger.info(
          {
            ...trace,
            phase: "check_run_failover_complete",
            checkRunId: startedCheckRunId,
          },
          "published failure check run"
        );
      } catch (publishErr) {
        input.logger.error(
          {
            ...trace,
            phase: "error",
            error: errorSummary(publishErr),
          },
          "failed to publish failure check run"
        );
      }
    }

    return { accepted: false, ignored: false };
  }
}

async function buildWorkflowRunJob(
  input: HandleWebhookInput,
  base: { deliveryId: string; installationId: number; payload: Record<string, any> }
) {
  const workflowRunId = input.payload.workflow_run?.id;
  const repository = input.payload.repository;

  if (typeof workflowRunId === "number" && repository?.owner?.login && repository?.name) {
    const response = await input.githubClient.getWorkflowRun(
      base.installationId,
      repository.owner.login,
      repository.name,
      workflowRunId
    );

    return normalizeWorkflowRunEvent({
      ...base,
      githubEnterpriseVersion: response.githubEnterpriseVersion,
      payload: {
        ...input.payload,
        workflow_run: response.data,
      },
    });
  }

  return normalizeWorkflowRunEvent(base);
}

async function buildReleaseJob(
  input: HandleWebhookInput,
  base: { deliveryId: string; installationId: number; payload: Record<string, any> }
) {
  const releaseId = input.payload.release?.id;
  const repository = input.payload.repository;

  if (typeof releaseId !== "number" || !repository?.owner?.login || !repository?.name) {
    return normalizeReleaseEvent(base);
  }

  const releaseResponse = await input.githubClient.getRelease(
    base.installationId,
    repository.owner.login,
    repository.name,
    releaseId
  );
  const releasePayload: Record<string, any> = {
    ...input.payload,
    release: releaseResponse.data as GitHubResourcePayload,
  };
  const targetCommitish = (releaseResponse.data as GitHubResourcePayload)?.target_commitish;

  if (typeof targetCommitish === "string" && targetCommitish.length > 0 && !looksLikeCommitSha(targetCommitish)) {
    const commitResponse = await input.githubClient.getCommit(
      base.installationId,
      repository.owner.login,
      repository.name,
      targetCommitish
    );
    releasePayload.release = {
      ...releasePayload.release,
      target_commitish: (commitResponse.data as GitHubResourcePayload).sha,
    };

    return normalizeReleaseEvent({
      ...base,
      githubEnterpriseVersion: releaseResponse.githubEnterpriseVersion || commitResponse.githubEnterpriseVersion,
      payload: releasePayload,
    });
  }

  return normalizeReleaseEvent({
    ...base,
    githubEnterpriseVersion: releaseResponse.githubEnterpriseVersion,
    payload: releasePayload,
  });
}

const COMMIT_SHA_RE = /^[a-f0-9]{7,64}$/i;

function looksLikeCommitSha(value: string) {
  return COMMIT_SHA_RE.test(value);
}
