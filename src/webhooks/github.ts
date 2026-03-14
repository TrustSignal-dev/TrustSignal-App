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

export async function handleGitHubWebhook(input: HandleWebhookInput) {
  const base = {
    deliveryId: input.parsed.deliveryId,
    installationId: input.parsed.installationId,
    payload: input.payload,
  };

  let verificationJob = null;

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
      normalizeCheckSuiteEvent(input.payload);
      break;
    case "check_run":
      normalizeCheckRunEvent(input.payload, input.appName);
      break;
  }

  if (!verificationJob) {
    input.logger.info(
      {
        deliveryId: input.parsed.deliveryId,
        event: input.parsed.event,
        action: input.parsed.action,
      },
      "github event ignored"
    );

    return { accepted: true, ignored: true };
  }

  const startedCheckRun = await publishCheckRun(input.githubClient, {
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
  }) as GitHubCheckRunResult;

  const verificationResult = await input.verificationService.verify(verificationJob);

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
      deliveryId: input.parsed.deliveryId,
      installationId: verificationJob.installationId,
      repositoryId: verificationJob.repository.id,
      event: verificationJob.eventName,
      repository: `${verificationJob.repository.owner}/${verificationJob.repository.repo}`,
      sha: verificationJob.headSha,
      checkRunId: startedCheckRun.id,
      githubEnterpriseVersion: verificationJob.githubEnterpriseVersion,
      receiptId: verificationResult.receiptId,
    },
    "github event processed"
  );

  return { accepted: true, ignored: false, receiptId: verificationResult.receiptId };
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

function looksLikeCommitSha(value: string) {
  return /^[a-f0-9]{7,64}$/i.test(value);
}
