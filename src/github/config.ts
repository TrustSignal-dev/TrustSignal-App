import type { AppEnv } from "../config/env";

const GITHUB_CLOUD_API_BASE_URL = "https://api.github.com";
const GITHUB_CLOUD_GRAPHQL_BASE_URL = "https://api.github.com/graphql";
const GITHUB_CLOUD_WEB_BASE_URL = "https://github.com";

export interface GitHubRuntimeConfig {
  appName: string;
  apiBaseUrl: string;
  graphqlBaseUrl: string;
  webBaseUrl: string;
}

export function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function resolveGitHubRuntimeConfig(
  env: Pick<AppEnv, "GITHUB_APP_NAME" | "GITHUB_API_BASE_URL" | "GITHUB_GRAPHQL_BASE_URL" | "GITHUB_WEB_BASE_URL">
): GitHubRuntimeConfig {
  const apiBaseUrl = trimTrailingSlash(env.GITHUB_API_BASE_URL || GITHUB_CLOUD_API_BASE_URL);

  return {
    appName: env.GITHUB_APP_NAME,
    apiBaseUrl,
    graphqlBaseUrl: trimTrailingSlash(env.GITHUB_GRAPHQL_BASE_URL || `${apiBaseUrl}/graphql` || GITHUB_CLOUD_GRAPHQL_BASE_URL),
    webBaseUrl: trimTrailingSlash(env.GITHUB_WEB_BASE_URL || inferWebBaseUrl(apiBaseUrl)),
  };
}

function inferWebBaseUrl(apiBaseUrl: string) {
  if (apiBaseUrl === GITHUB_CLOUD_API_BASE_URL) {
    return GITHUB_CLOUD_WEB_BASE_URL;
  }

  return apiBaseUrl.replace(/\/api\/v3$/i, "");
}
