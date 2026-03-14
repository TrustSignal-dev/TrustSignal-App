export type SupportedGitHubEvent =
  | "workflow_run"
  | "release"
  | "push"
  | "check_suite"
  | "check_run";

export type VerificationCheckStatus = "queued" | "in_progress" | "completed";
export type VerificationCheckConclusion = "success" | "failure" | "neutral";

export interface ParsedGitHubEvent {
  deliveryId: string;
  event: SupportedGitHubEvent;
  action?: string;
  installationId: number;
  repositoryId?: number;
}

export interface RepositoryRef {
  owner: string;
  repo: string;
  id?: number;
  defaultBranch?: string;
  htmlUrl?: string;
}

export interface VerificationJobInput {
  deliveryId: string;
  eventName: SupportedGitHubEvent;
  installationId: number;
  repository: RepositoryRef;
  headSha: string;
  externalId: string;
  summaryContext: string;
  detailsUrl?: string;
  githubEnterpriseVersion?: string;
  provenance: Record<string, string | number | boolean | undefined>;
}

export interface VerificationResult {
  status: VerificationCheckStatus;
  conclusion?: VerificationCheckConclusion;
  title: string;
  summary: string;
  detailsUrl?: string;
  receiptId?: string;
  verificationTimestamp: string;
  provenanceNote: string;
}

export interface CheckRunRequest {
  installationId: number;
  owner: string;
  repo: string;
  headSha: string;
  checkRunId?: number;
  status: VerificationCheckStatus;
  conclusion?: VerificationCheckConclusion;
  externalId: string;
  title: string;
  summary: string;
  detailsUrl?: string;
  receiptId?: string;
  verificationTimestamp: string;
  provenanceNote: string;
}
