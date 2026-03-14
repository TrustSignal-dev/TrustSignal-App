import { describe, expect, it } from "vitest";
import { normalizeWorkflowRunEvent } from "../src/webhooks/handlers/workflowRun";
import { normalizeGitHubEventToEnvelope } from "../src/trustsignal/github";
import { buildTrustSignalVerificationRequest, mapVerificationJobToEnvelope } from "../src/trustsignal/types";

describe("TrustSignal verification contract consistency", () => {
  it("builds the same request for equivalent workflow_run inputs from the app and action", () => {
    const payload = {
      action: "completed",
      repository: {
        name: "repo",
        default_branch: "main",
        html_url: "https://github.com/acme/repo",
        owner: { login: "acme" },
      },
      workflow_run: {
        id: 101,
        status: "completed",
        conclusion: "success",
        head_sha: "abc1234",
        html_url: "https://github.com/acme/repo/actions/runs/101",
        name: "CI",
        event: "push",
      },
    };

    const appJob = normalizeWorkflowRunEvent({
      deliveryId: "delivery-1",
      installationId: 7,
      payload,
    });
    const actionEnvelope = normalizeGitHubEventToEnvelope({
      eventName: "workflow_run",
      action: "completed",
      payload,
    });

    expect(appJob).not.toBeNull();
    expect(actionEnvelope).not.toBeNull();

    const appRequest = buildTrustSignalVerificationRequest(mapVerificationJobToEnvelope(appJob!));
    const actionRequest = buildTrustSignalVerificationRequest(actionEnvelope!);

    expect(actionRequest).toEqual(appRequest);
  });
});
