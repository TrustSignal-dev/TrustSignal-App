import { z } from "zod";
import type { SupportedGitHubEvent, VerificationCheckConclusion, VerificationCheckStatus, VerificationJobInput } from "../types/github";

export type ProvenanceValue = string | number | boolean | undefined;

export interface GitHubVerificationEnvelope {
  eventName: SupportedGitHubEvent;
  externalId: string;
  summaryContext: string;
  headSha: string;
  detailsUrl?: string;
  repository: {
    id?: number;
    owner: string;
    repo: string;
    defaultBranch?: string;
    htmlUrl?: string;
  };
  provenance: Record<string, ProvenanceValue>;
}

export const trustSignalVerificationRequestSchema = z
  .object({
    apiVersion: z.literal("2026-03-13"),
    provider: z.literal("github"),
    externalId: z.string().min(1),
    headSha: z.string().min(7).max(64),
    detailsUrl: z.string().url().optional(),
    subject: z
      .object({
        kind: z.enum(["workflow_run", "release", "commit"]),
        summary: z.string().min(1),
      })
      .strict(),
    repository: z
      .object({
        owner: z.string().min(1),
        repo: z.string().min(1),
        fullName: z.string().min(3),
        defaultBranch: z.string().min(1).optional(),
        htmlUrl: z.string().url().optional(),
      })
      .strict(),
    provenance: z
      .object({
        eventName: z.enum(["workflow_run", "release", "push"]),
        attributes: z.record(z.string(), z.string()),
      })
      .strict(),
  })
  .strict();

export const trustSignalVerificationResponseSchema = z
  .object({
    status: z.enum(["queued", "in_progress", "completed"]),
    conclusion: z.enum(["success", "failure", "neutral"]).optional(),
    title: z.string().min(1),
    summary: z.string().min(1),
    detailsUrl: z.string().url().optional(),
    receiptId: z.string().min(1).optional(),
    verificationTimestamp: z.string().datetime({ offset: true }),
    provenanceNote: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === "completed" && !value.conclusion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["conclusion"],
        message: "conclusion is required when status is completed",
      });
    }
  });

export type TrustSignalVerificationRequest = z.infer<typeof trustSignalVerificationRequestSchema>;
export type TrustSignalVerificationResponse = z.infer<typeof trustSignalVerificationResponseSchema>;

export interface TrustSignalVerificationService {
  verify(job: VerificationJobInput): Promise<TrustSignalVerificationResponse>;
}

export function mapVerificationJobToEnvelope(job: VerificationJobInput): GitHubVerificationEnvelope {
  return {
    eventName: job.eventName,
    externalId: job.externalId,
    summaryContext: job.summaryContext,
    headSha: job.headSha,
    detailsUrl: job.detailsUrl,
    repository: job.repository,
    provenance: job.provenance,
  };
}

export function normalizeProvenanceAttributes(input: Record<string, ProvenanceValue>) {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, String(value)])
  );
}

export function buildTrustSignalVerificationRequest(
  envelope: GitHubVerificationEnvelope
): TrustSignalVerificationRequest {
  const request: TrustSignalVerificationRequest = {
    apiVersion: "2026-03-13",
    provider: "github",
    externalId: envelope.externalId,
    headSha: envelope.headSha,
    detailsUrl: envelope.detailsUrl,
    subject: {
      kind: mapSubjectKind(envelope.eventName),
      summary: envelope.summaryContext,
    },
    repository: {
      owner: envelope.repository.owner,
      repo: envelope.repository.repo,
      fullName: `${envelope.repository.owner}/${envelope.repository.repo}`,
      defaultBranch: envelope.repository.defaultBranch,
      htmlUrl: envelope.repository.htmlUrl,
    },
    provenance: {
      eventName: mapProvenanceEventName(envelope.eventName),
      attributes: normalizeProvenanceAttributes(envelope.provenance),
    },
  };

  return trustSignalVerificationRequestSchema.parse(request);
}

function mapSubjectKind(eventName: SupportedGitHubEvent) {
  if (eventName === "workflow_run") return "workflow_run";
  if (eventName === "release") return "release";
  return "commit";
}

function mapProvenanceEventName(eventName: SupportedGitHubEvent): "workflow_run" | "release" | "push" {
  if (eventName === "workflow_run" || eventName === "release" || eventName === "push") {
    return eventName;
  }

  return "push";
}

export type {
  VerificationCheckConclusion,
  VerificationCheckStatus,
};
