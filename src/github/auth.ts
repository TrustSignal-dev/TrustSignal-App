import jwt from "jsonwebtoken";

interface CachedInstallationToken {
  token: string;
  expiresAtMs: number;
}

export class GitHubAppAuth {
  private readonly installationTokens = new Map<number, CachedInstallationToken>();

  constructor(private readonly env: { GITHUB_APP_ID: string; GITHUB_PRIVATE_KEY_PEM: string }) {}

  createAppJwt(now = Math.floor(Date.now() / 1000)) {
    return jwt.sign(
      {
        iat: now - 60,
        exp: now + 9 * 60,
        iss: this.env.GITHUB_APP_ID,
      },
      this.env.GITHUB_PRIVATE_KEY_PEM,
      {
        algorithm: "RS256",
      }
    );
  }

  getCachedInstallationToken(installationId: number, now = Date.now()) {
    const cached = this.installationTokens.get(installationId);
    if (!cached) return null;
    if (cached.expiresAtMs <= now + 60_000) {
      this.installationTokens.delete(installationId);
      return null;
    }

    return cached.token;
  }

  cacheInstallationToken(installationId: number, token: string, expiresAt: string) {
    this.installationTokens.set(installationId, {
      token,
      expiresAtMs: new Date(expiresAt).getTime(),
    });
  }

  async getInstallationToken(
    installationId: number,
    requestInstallationToken: (appJwt: string) => Promise<{ token: string; expiresAt: string }>
  ) {
    const cached = this.getCachedInstallationToken(installationId);
    if (cached) return cached;

    const appJwt = this.createAppJwt();
    const freshToken = await requestInstallationToken(appJwt);
    this.cacheInstallationToken(installationId, freshToken.token, freshToken.expiresAt);
    return freshToken.token;
  }
}
