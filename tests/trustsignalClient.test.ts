import { describe, expect, it, vi } from "vitest";
import { TrustSignalVerificationClient } from "../src/trustsignal/client";
import { buildTrustSignalVerificationRequest } from "../src/trustsignal/types";

describe("TrustSignalVerificationClient", () => {
  it("posts the shared verification contract and parses the response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          status: "completed",
          conclusion: "success",
          title: "Artifact verification completed",
          summary: "Verification succeeded",
          detailsUrl: "https://trustsignal.example.com/receipts/rcpt_1",
          receiptId: "rcpt_1",
          verificationTimestamp: "2026-03-13T00:00:00.000Z",
          provenanceNote: "workflow_run event workflow_run:101",
        })
      ),
    });
    const client = new TrustSignalVerificationClient(
      {
        apiBaseUrl: "https://trustsignal.example.com",
        apiKey: "secret",
      },
      fetchImpl as any
    );

    const request = buildTrustSignalVerificationRequest({
      eventName: "workflow_run",
      externalId: "workflow_run:101",
      summaryContext: "workflow run 101",
      headSha: "abc1234",
      detailsUrl: "https://github.com/acme/repo/actions/runs/101",
      repository: {
        owner: "acme",
        repo: "repo",
        defaultBranch: "main",
        htmlUrl: "https://github.com/acme/repo",
      },
      provenance: {
        conclusion: "success",
        event: "push",
        runId: 101,
        workflowName: "CI",
      },
    });

    const result = await client.verify(request);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://trustsignal.example.com/v1/verifications/github",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer secret",
        }),
      })
    );
    expect(result.receiptId).toBe("rcpt_1");
  });
});
