import { describe, expect, it, vi } from "vitest";
import { handleGitHubWebhook } from "../src/webhooks/github";

describe("handleGitHubWebhook", () => {
  it("updates the started check run instead of creating a second one", async () => {
    const githubClient = {
      getWorkflowRun: vi.fn().mockResolvedValue({
        data: {
          id: 101,
          status: "completed",
          conclusion: "success",
          head_sha: "abc1234",
          html_url: "https://github.com/acme/repo/actions/runs/101",
          name: "CI",
          event: "push",
        },
      }),
      createCheckRun: vi
        .fn()
        .mockResolvedValueOnce({ id: 42, html_url: "https://github.com/acme/repo/runs/42", status: "in_progress" }),
      updateCheckRun: vi
        .fn()
        .mockResolvedValueOnce({ id: 42, html_url: "https://github.com/acme/repo/runs/42", status: "completed", conclusion: "success" }),
    } as any;
    const verificationService = {
      verify: vi.fn().mockResolvedValue({
        status: "completed",
        conclusion: "success",
        title: "Artifact verification completed",
        summary: "Verification succeeded",
        detailsUrl: "https://trustsignal.example.com/receipts/rcpt_1",
        receiptId: "rcpt_1",
        verificationTimestamp: "2026-03-13T00:00:00.000Z",
        provenanceNote: "workflow_run event workflow_run:101",
      }),
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    const result = await handleGitHubWebhook({
      parsed: {
        deliveryId: "delivery-1",
        event: "workflow_run",
        action: "completed",
        installationId: 7,
      },
      payload: {
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
      },
      githubClient,
      verificationService,
      logger,
      appName: "TrustSignal",
    });

    expect(result).toEqual({ accepted: true, ignored: false, receiptId: "rcpt_1" });
    expect(githubClient.createCheckRun).toHaveBeenCalledTimes(1);
    expect(githubClient.updateCheckRun).toHaveBeenCalledTimes(1);
    expect(githubClient.updateCheckRun).toHaveBeenCalledWith(
      7,
      "acme",
      "repo",
      42,
      expect.objectContaining({
        status: "completed",
        conclusion: "success",
      })
    );
    expect(githubClient.getWorkflowRun).toHaveBeenCalledWith(7, "acme", "repo", 101);
  });
});
