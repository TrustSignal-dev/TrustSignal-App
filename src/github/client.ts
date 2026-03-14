import { Octokit } from "@octokit/core";
import { retry } from "@octokit/plugin-retry";
import type { AppEnv } from "../config/env";
import { GitHubAppAuth } from "./auth";
import { resolveGitHubRuntimeConfig, type GitHubRuntimeConfig } from "./config";

const RetryOctokit = Octokit.plugin(retry);

export interface GitHubApiResponse<T> {
  data: T;
  githubEnterpriseVersion?: string;
}

export interface CreateCheckRunParams {
  name: string;
  head_sha: string;
  status: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral";
  external_id: string;
  details_url?: string;
  output: {
    title: string;
    summary: string;
    text?: string;
  };
}

interface OctokitLike {
  request(route: string, parameters?: Record<string, unknown>): Promise<OctokitLikeResponse>;
}

type OctokitFactory = (authToken: string) => OctokitLike;

interface OctokitLikeResponse {
  data: any;
  headers?: Record<string, string | number | undefined>;
}

export class GitHubApiClient {
  private readonly config: GitHubRuntimeConfig;
  private readonly auth: GitHubAppAuth;
  private readonly octokitFactory?: OctokitFactory;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    env: Pick<
      AppEnv,
      "GITHUB_APP_NAME" | "GITHUB_API_BASE_URL" | "GITHUB_GRAPHQL_BASE_URL" | "GITHUB_WEB_BASE_URL"
    >,
    auth: GitHubAppAuth,
    octokitFactory?: OctokitFactory,
    sleep: (ms: number) => Promise<void> = defaultSleep
  ) {
    this.config = resolveGitHubRuntimeConfig(env);
    this.auth = auth;
    this.octokitFactory = octokitFactory;
    this.sleep = sleep;
  }

  private createOctokit(authToken: string) {
    if (this.octokitFactory) {
      return this.octokitFactory(authToken);
    }

    return new RetryOctokit({
      auth: authToken,
      baseUrl: this.config.apiBaseUrl,
      userAgent: `${this.config.appName} GitHub App`,
      retry: {
        enabled: false,
      },
      request: {
        timeout: 10_000,
        headers: {
          "x-github-api-version": "2022-11-28",
        },
      },
    });
  }

  async getAppClient() {
    const jwt = this.auth.createAppJwt();
    return this.createOctokit(jwt);
  }

  async getInstallationClient(installationId: number) {
    const token = await this.auth.getInstallationToken(installationId, async (appJwt) => {
      const response = await this.requestWithRetry(
        () =>
          this.createOctokit(appJwt).request("POST /app/installations/{installation_id}/access_tokens", {
            installation_id: installationId,
          }),
        0
      );

      return {
        token: response.data.token,
        expiresAt: response.data.expires_at,
      };
    });

    return this.createOctokit(token);
  }

  async listInstallations() {
    const response = await this.githubRequest<any[]>("GET /app/installations", undefined, { auth: "app" });
    return response.data.map((installation: any) => ({
      id: installation.id,
      accountLogin: installation.account?.login,
      targetType: installation.target_type,
      repositorySelection: installation.repository_selection,
      htmlUrl: installation.html_url,
    }));
  }

  async getRepositoryMetadata(installationId: number, owner: string, repo: string) {
    return this.githubRequest("GET /repos/{owner}/{repo}", { owner, repo }, { installationId });
  }

  async getWorkflowRun(installationId: number, owner: string, repo: string, runId: number) {
    return this.githubRequest("GET /repos/{owner}/{repo}/actions/runs/{run_id}", {
      owner,
      repo,
      run_id: runId,
    }, { installationId });
  }

  async getRelease(installationId: number, owner: string, repo: string, releaseId: number) {
    return this.githubRequest("GET /repos/{owner}/{repo}/releases/{release_id}", {
      owner,
      repo,
      release_id: releaseId,
    }, { installationId });
  }

  async getCommit(installationId: number, owner: string, repo: string, ref: string) {
    return this.githubRequest("GET /repos/{owner}/{repo}/commits/{ref}", { owner, repo, ref }, { installationId });
  }

  async createCheckRun(installationId: number, owner: string, repo: string, payload: CreateCheckRunParams) {
    const response = await this.githubRequest("POST /repos/{owner}/{repo}/check-runs", {
      owner,
      repo,
      ...payload,
    }, { installationId });
    return response.data;
  }

  async updateCheckRun(
    installationId: number,
    owner: string,
    repo: string,
    checkRunId: number,
    payload: Omit<CreateCheckRunParams, "head_sha" | "name">
  ) {
    const response = await this.githubRequest("PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}", {
      owner,
      repo,
      check_run_id: checkRunId,
      ...payload,
    }, { installationId });
    return response.data;
  }

  async githubRequest<T>(
    route: string,
    parameters?: Record<string, unknown>,
    options?: { installationId?: number; auth?: "app" | "installation" }
  ): Promise<GitHubApiResponse<T>> {
    const authMode = options?.auth || "installation";
    if (authMode === "installation" && !options?.installationId) {
      throw new Error("installationId is required for installation-scoped GitHub requests");
    }

    const client =
      authMode === "app"
        ? await this.getAppClient()
        : await this.getInstallationClient(options!.installationId!);
    const response = await this.requestWithRetry(() => client.request(route, parameters), 2);

    return {
      data: response.data as T,
      githubEnterpriseVersion: getGitHubEnterpriseVersion(response.headers),
    };
  }

  private async requestWithRetry<T extends OctokitLikeResponse>(
    fn: () => Promise<T>,
    retriesRemaining: number,
    attempt = 0
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const status = getGitHubStatusCode(error);
      if (!shouldRetryGitHubRequest(status) || retriesRemaining <= 0) {
        throw error;
      }

      const delayMs = getRetryDelayMs(error, attempt);
      if (delayMs > 0) {
        await this.sleep(delayMs);
      }

      return this.requestWithRetry(fn, retriesRemaining - 1, attempt + 1);
    }
  }
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function getGitHubStatusCode(error: unknown) {
  if (typeof error === "object" && error !== null && "status" in error && typeof error.status === "number") {
    return error.status;
  }

  return undefined;
}

function getRetryDelayMs(error: unknown, attempt: number) {
  const headerValue =
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "headers" in error.response &&
    typeof error.response.headers === "object" &&
    error.response.headers !== null &&
    "retry-after" in error.response.headers
      ? Number(error.response.headers["retry-after"])
      : undefined;

  if (typeof headerValue === "number" && Number.isFinite(headerValue) && headerValue >= 0) {
    return Math.min(headerValue * 1000, 5_000);
  }

  return Math.min(250 * 2 ** attempt, 1_000);
}

function getGitHubEnterpriseVersion(headers?: Record<string, string | number | undefined>) {
  const version = headers?.["x-github-enterprise-version"];
  return version === undefined ? undefined : String(version);
}

export function shouldRetryGitHubRequest(status?: number) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}
