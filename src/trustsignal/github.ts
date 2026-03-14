import type { SupportedGitHubEvent } from "../types/github";
import type { GitHubVerificationEnvelope } from "./types";

export function normalizeGitHubEventToEnvelope(input: {
  eventName: SupportedGitHubEvent;
  action?: string;
  payload: Record<string, any>;
}): GitHubVerificationEnvelope | null {
  switch (input.eventName) {
    case "workflow_run":
      return normalizeWorkflowRunPayload(input.payload);
    case "release":
      return normalizeReleasePayload(input.payload);
    case "push":
      return normalizePushPayload(input.payload);
    case "check_suite":
      return normalizeCheckSuitePayload(input.payload);
    default:
      return null;
  }
}

export function normalizeWorkflowRunPayload(payload: Record<string, any>): GitHubVerificationEnvelope | null {
  const workflowRun = payload.workflow_run;
  const repository = payload.repository;

  if (!workflowRun || workflowRun.status !== "completed") {
    return null;
  }

  return {
    eventName: "workflow_run",
    repository: {
      id: repository.id,
      owner: repository.owner.login,
      repo: repository.name,
      defaultBranch: repository.default_branch,
      htmlUrl: repository.html_url,
    },
    headSha: workflowRun.head_sha,
    externalId: `workflow_run:${workflowRun.id}`,
    summaryContext: `workflow run ${workflowRun.id}`,
    detailsUrl: workflowRun.html_url,
    provenance: {
      conclusion: workflowRun.conclusion,
      event: workflowRun.event,
      runId: workflowRun.id,
      workflowName: workflowRun.name,
    },
  };
}

export function normalizeReleasePayload(payload: Record<string, any>): GitHubVerificationEnvelope | null {
  if (payload.action !== "published") {
    return null;
  }

  const release = payload.release;
  const repository = payload.repository;

  return {
    eventName: "release",
    repository: {
      id: repository.id,
      owner: repository.owner.login,
      repo: repository.name,
      defaultBranch: repository.default_branch,
      htmlUrl: repository.html_url,
    },
    headSha: release.target_commitish || repository.default_branch,
    externalId: `release:${release.id}`,
    summaryContext: `release ${release.tag_name}`,
    detailsUrl: release.html_url,
    provenance: {
      assets: Array.isArray(release.assets) ? release.assets.length : 0,
      releaseId: release.id,
      tagName: release.tag_name,
    },
  };
}

export function normalizePushPayload(payload: Record<string, any>): GitHubVerificationEnvelope | null {
  const repository = payload.repository;
  const ref = String(payload.ref || "");
  const branchName = ref.replace("refs/heads/", "");

  if (branchName && repository.default_branch && branchName !== repository.default_branch) {
    return null;
  }

  return {
    eventName: "push",
    repository: {
      id: repository.id,
      owner: repository.owner.name || repository.owner.login,
      repo: repository.name,
      defaultBranch: repository.default_branch,
      htmlUrl: repository.html_url,
    },
    headSha: payload.after,
    externalId: `push:${payload.after}`,
    summaryContext: `push ${branchName || repository.default_branch}`,
    detailsUrl: `${repository.html_url}/commit/${payload.after}`,
    provenance: {
      after: payload.after,
      before: payload.before,
      ref,
    },
  };
}

export function normalizeCheckSuitePayload(payload: Record<string, any>): GitHubVerificationEnvelope | null {
  const checkSuite = payload.check_suite;
  const repository = payload.repository;
  const headSha =
    typeof checkSuite?.head_sha === "string" && checkSuite.head_sha.length > 0
      ? checkSuite.head_sha
      : typeof payload.after === "string" && payload.after.length > 0
      ? payload.after
      : typeof payload.head_sha === "string" && payload.head_sha.length > 0
      ? payload.head_sha
      : undefined;

  if (!checkSuite || !repository || !headSha) {
    return null;
  }

  if (checkSuite.app?.slug === "trustsignal") {
    return null;
  }

  return {
    eventName: "check_suite",
    repository: {
      id: repository.id,
      owner: repository.owner.name || repository.owner.login,
      repo: repository.name,
      defaultBranch: repository.default_branch,
      htmlUrl: repository.html_url,
    },
    headSha,
    externalId: `check_suite:${checkSuite.id}`,
    summaryContext: `check suite ${checkSuite.id}`,
    detailsUrl: checkSuite.url,
    provenance: {
      action: payload.action,
      checkSuiteStatus: checkSuite.status,
      checkSuiteConclusion: checkSuite.conclusion,
      pullRequests: Array.isArray(payload.check_suite?.pull_requests) ? payload.check_suite.pull_requests.length : 0,
      appSlug: checkSuite.app?.slug,
    },
  };
}
