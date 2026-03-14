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

  it("processes requested check_suite events", async () => {
    const githubClient = {
      getWorkflowRun: vi.fn(),
      createCheckRun: vi
        .fn()
        .mockResolvedValueOnce({ id: 84, html_url: "https://github.com/acme/repo/runs/84", status: "in_progress" }),
      updateCheckRun: vi
        .fn()
        .mockResolvedValueOnce({ id: 84, html_url: "https://github.com/acme/repo/runs/84", status: "completed", conclusion: "success" }),
    } as any;
    const verificationService = {
      verify: vi.fn().mockResolvedValue({
        status: "completed",
        conclusion: "success",
        title: "Artifact verification completed",
        summary: "Verification succeeded",
        detailsUrl: "https://trustsignal.example.com/receipts/rcpt_2",
        receiptId: "rcpt_2",
        verificationTimestamp: "2026-03-14T00:00:00.000Z",
        provenanceNote: "check_suite event check_suite:321",
      }),
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    const result = await handleGitHubWebhook({
      parsed: {
        deliveryId: "delivery-2",
        event: "check_suite",
        action: "requested",
        installationId: 11,
      },
      payload: {
        action: "requested",
        check_suite: {
          id: 321,
          head_sha: "def5678",
          status: "queued",
          conclusion: null,
          head_branch: "main",
          app: {
            slug: "other-app",
          },
          pull_requests: [],
        },
        repository: {
          id: 22,
          name: "repo",
          default_branch: "main",
          html_url: "https://github.com/acme/repo",
          owner: { login: "acme" },
        },
      },
      githubClient,
      verificationService,
      logger,
      appName: "TrustSignal",
    });

    expect(result).toEqual({ accepted: true, ignored: false, receiptId: "rcpt_2" });
    expect(githubClient.createCheckRun).toHaveBeenCalledTimes(1);
    expect(githubClient.updateCheckRun).toHaveBeenCalledTimes(1);
    const createCall = (githubClient.createCheckRun as any).mock.calls[0];
    expect(createCall[0]).toBe(11);
    expect(createCall[1]).toBe("acme");
    expect(createCall[2]).toBe("repo");
    expect(createCall[3]).toMatchObject({
      status: "in_progress",
      output: {
        title: "Verification started",
      },
    });
  });

  it("processes requested check_suite events using after as fallback", async () => {
    const githubClient = {
      createCheckRun: vi
        .fn()
        .mockResolvedValueOnce({ id: 91, html_url: "https://github.com/acme/repo/runs/91", status: "in_progress" }),
      updateCheckRun: vi
        .fn()
        .mockResolvedValueOnce({ id: 91, html_url: "https://github.com/acme/repo/runs/91", status: "completed", conclusion: "success" }),
    } as any;
    const verificationService = {
      verify: vi.fn().mockResolvedValue({
        status: "completed",
        conclusion: "success",
        title: "Artifact verification completed",
        summary: "Verification succeeded",
        detailsUrl: "https://trustsignal.example.com/receipts/rcpt_3",
        receiptId: "rcpt_3",
        verificationTimestamp: "2026-03-14T00:00:00.000Z",
        provenanceNote: "check_suite event check_suite:654",
      }),
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    const result = await handleGitHubWebhook({
      parsed: {
        deliveryId: "delivery-3",
        event: "check_suite",
        action: "requested",
        installationId: 11,
      },
      payload: {
        action: "requested",
        after: "def9999",
        check_suite: {
          id: 654,
          status: "queued",
          conclusion: null,
          head_branch: "main",
          app: {
            slug: "other-app",
          },
          pull_requests: [],
        },
        repository: {
          id: 22,
          name: "repo",
          default_branch: "main",
          html_url: "https://github.com/acme/repo",
          owner: { login: "acme" },
        },
      },
      githubClient,
      verificationService,
      logger,
      appName: "TrustSignal",
    });

    expect(result).toEqual({ accepted: true, ignored: false, receiptId: "rcpt_3" });
  });

  it("processes requested check_suite events even when the check suite app matches the GitHub app", async () => {
    const githubClient = {
      createCheckRun: vi
        .fn()
        .mockResolvedValueOnce({ id: 101, html_url: "https://github.com/acme/repo/runs/101", status: "in_progress" }),
      updateCheckRun: vi
        .fn()
        .mockResolvedValueOnce({ id: 101, html_url: "https://github.com/acme/repo/runs/101", status: "completed", conclusion: "success" }),
    } as any;
    const verificationService = {
      verify: vi.fn().mockResolvedValue({
        status: "completed",
        conclusion: "success",
        title: "Artifact verification completed",
        summary: "Verification succeeded",
        detailsUrl: "https://trustsignal.example.com/receipts/rcpt_4",
        receiptId: "rcpt_4",
        verificationTimestamp: "2026-03-14T00:00:00.000Z",
        provenanceNote: "check_suite event check_suite:999",
      }),
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    const result = await handleGitHubWebhook({
      parsed: {
        deliveryId: "delivery-4",
        event: "check_suite",
        action: "requested",
        installationId: 11,
      },
      payload: {
        action: "requested",
        check_suite: {
          id: 999,
          head_sha: "def5678",
          status: "queued",
          conclusion: null,
          head_branch: "main",
          app: {
            name: "TrustSignal-Verify",
            slug: "trustsignal-verify",
          },
          pull_requests: [],
        },
        repository: {
          id: 22,
          name: "repo",
          default_branch: "main",
          html_url: "https://github.com/acme/repo",
          owner: { login: "acme" },
        },
      },
      githubClient,
      verificationService,
      logger,
      appName: "TrustSignal-Verify",
    });

    expect(result).toEqual({ accepted: true, ignored: false, receiptId: "rcpt_4" });
  });
});
