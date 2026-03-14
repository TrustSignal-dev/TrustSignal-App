import type { VerificationJobInput } from "../../types/github";
import { normalizeWorkflowRunPayload } from "../../trustsignal/github";

export function normalizeWorkflowRunEvent(parsed: {
  deliveryId: string;
  installationId: number;
  githubEnterpriseVersion?: string;
  payload: Record<string, any>;
}): VerificationJobInput | null {
  const envelope = normalizeWorkflowRunPayload(parsed.payload);
  if (!envelope) {
    return null;
  }

  return {
    deliveryId: parsed.deliveryId,
    eventName: "workflow_run",
    installationId: parsed.installationId,
    repository: envelope.repository,
    headSha: envelope.headSha,
    externalId: envelope.externalId,
    summaryContext: envelope.summaryContext,
    detailsUrl: envelope.detailsUrl,
    githubEnterpriseVersion: parsed.githubEnterpriseVersion,
    provenance: {
      ...envelope.provenance,
      githubEnterpriseVersion: parsed.githubEnterpriseVersion,
    },
  };
}
