import { mkdir } from "fs/promises";
import { dirname } from "path";
import type { TokenStore } from "../types.ts";

const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes
const TOKEN_ENDPOINT = "https://www.upwork.com/api/v3/oauth2/token";

export class TokenManager {
  constructor(
    private readonly tokensPath: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  async loadTokens(): Promise<TokenStore> {
    const file = Bun.file(this.tokensPath);
    if (!(await file.exists())) {
      throw new Error(
        `Token file not found at ${this.tokensPath}. Run 'bun run setup' first.`,
      );
    }
    return await file.json();
  }

  async saveTokens(tokens: TokenStore): Promise<void> {
    await mkdir(dirname(this.tokensPath), { recursive: true });
    const tempPath = this.tokensPath + ".tmp";
    await Bun.write(tempPath, JSON.stringify(tokens, null, 2));
    const { rename } = await import("fs/promises");
    await rename(tempPath, this.tokensPath);
  }

  isExpired(expiresAt: number): boolean {
    return Date.now() + EXPIRY_BUFFER_MS >= expiresAt;
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenStore> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Token refresh failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    if (!data.access_token || !data.refresh_token || !data.expires_in) {
      throw new Error(
        `Token refresh returned incomplete data. Keys: ${Object.keys(data).join(", ")}`,
      );
    }
    const tokens: TokenStore = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    await this.saveTokens(tokens);
    return tokens;
  }

  async getValidToken(): Promise<string> {
    const tokens = await this.loadTokens();

    if (!this.isExpired(tokens.expiresAt)) {
      return tokens.accessToken;
    }

    const refreshed = await this.refreshAccessToken(tokens.refreshToken);
    return refreshed.accessToken;
  }
}
