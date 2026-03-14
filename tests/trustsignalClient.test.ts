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
      "https://trustsignal.example.com/api/v1/verifications/github",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer secret",
        }),
      })
    );
    expect(result.receiptId).toBe("rcpt_1");
  });

  it("falls back to /v1/verifications/github when /api returns HTML", async () => {
    const fallbackResponse = {
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          status: "completed",
          conclusion: "success",
          title: "Artifact verification completed",
          summary: "Verification succeeded",
          detailsUrl: "https://trustsignal.example.com/receipts/rcpt_2",
          receiptId: "rcpt_2",
          verificationTimestamp: "2026-03-13T00:00:00.000Z",
          provenanceNote: "workflow_run event workflow_run:101",
        })
      ),
      headers: new Map([["content-type", "application/json"]]),
    };

    const primaryResponse = {
      ok: false,
      status: 404,
      text: vi.fn().mockResolvedValue("The page could not be found"),
      headers: new Map([["content-type", "text/plain; charset=utf-8"]]),
    };

    const fetchImplementation = vi.fn(async (url: string) => {
      const response = url === "https://trustsignal.example.com/api/v1/verifications/github" ? primaryResponse : fallbackResponse;
      return {
        ok: response.ok,
        status: response.status,
        headers: { get: (name: string) => response.headers.get(name.toLowerCase()) || response.headers.get(name.toUpperCase()) || null },
        text: response.text,
      };
    });

    const client = new TrustSignalVerificationClient(
      {
        apiBaseUrl: "https://trustsignal.example.com",
        apiKey: "secret",
      },
      fetchImplementation as any
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

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      "https://trustsignal.example.com/api/v1/verifications/github",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer secret",
        }),
      })
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      "https://trustsignal.example.com/v1/verifications/github",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer secret",
        }),
      })
    );
    expect(result.receiptId).toBe("rcpt_2");
  });

  it("fails closed when verification endpoint returns non-JSON on all supported paths", async () => {
    const fetchImplementation = vi.fn(async () => ({
      ok: false,
      status: 404,
      headers: { get: () => "text/plain; charset=utf-8" },
      text: vi.fn().mockResolvedValue("Not Found"),
    }));

    const client = new TrustSignalVerificationClient(
      {
        apiBaseUrl: "https://trustsignal.example.com",
        apiKey: "secret",
      },
      fetchImplementation as any
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

    await expect(client.verify(request)).rejects.toThrow("TrustSignal verification response for https://trustsignal.example.com/v1/verifications/github was not JSON");
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });
});
