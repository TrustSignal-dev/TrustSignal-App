import { describe, expect, it } from "vitest";
import { buildCheckRunPayload } from "../src/checks/publishCheckRun";

describe("buildCheckRunPayload", () => {
  it("maps verification output to GitHub check-run payload", () => {
    const payload = buildCheckRunPayload({
      installationId: 1,
      owner: "acme",
      repo: "repo",
      headSha: "abc123",
      status: "completed",
      conclusion: "success",
      externalId: "workflow_run:1",
      title: "Artifact verification completed",
      summary: "All checks passed",
      receiptId: "rcpt_123",
      verificationTimestamp: "2026-03-13T00:00:00.000Z",
      provenanceNote: "workflow_run event",
    });

    if (payload.status !== "completed") {
      throw new Error("expected completed payload");
    }

    expect(payload.conclusion).toBe("success");
    expect(payload.output.text).toContain("rcpt_123");
  });
});
