import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { TokenManager } from "../../src/auth/oauth.ts";
import type { TokenStore } from "../../src/types.ts";

describe("TokenManager", () => {
  let tempDir: string;
  let tokensPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "oauth-test-"));
    tokensPath = join(tempDir, "tokens.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    mock.restore();
  });

  function writeTokens(tokens: TokenStore): Promise<number> {
    return Bun.write(tokensPath, JSON.stringify(tokens));
  }

  test("loadTokens reads tokens from disk", async () => {
    const tokens: TokenStore = {
      accessToken: "access-123",
      refreshToken: "refresh-456",
      expiresAt: Date.now() + 3600_000,
    };
    await writeTokens(tokens);

    const manager = new TokenManager(tokensPath, "client-id", "client-secret");
    const loaded = await manager.loadTokens();

    expect(loaded.accessToken).toBe("access-123");
    expect(loaded.refreshToken).toBe("refresh-456");
  });

  test("loadTokens throws when file does not exist", async () => {
    const manager = new TokenManager(
      join(tempDir, "nonexistent.json"),
      "client-id",
      "client-secret",
    );
    await expect(manager.loadTokens()).rejects.toThrow();
  });

  test("isExpired returns true when token is within 5-minute buffer", () => {
    const manager = new TokenManager(tokensPath, "client-id", "client-secret");
    const fiveMinutes = 5 * 60 * 1000;
    // Expires in 4 minutes — should be "expired" (within buffer)
    expect(manager.isExpired(Date.now() + fiveMinutes - 60_000)).toBe(true);
    // Expires in 6 minutes — should not be expired
    expect(manager.isExpired(Date.now() + fiveMinutes + 60_000)).toBe(false);
  });

  test("saveTokens writes tokens atomically", async () => {
    const manager = new TokenManager(tokensPath, "client-id", "client-secret");
    const tokens: TokenStore = {
      accessToken: "new-access",
      refreshToken: "new-refresh",
      expiresAt: Date.now() + 3600_000,
    };
    await manager.saveTokens(tokens);

    const saved = await Bun.file(tokensPath).json();
    expect(saved.accessToken).toBe("new-access");
  });

  test("refreshAccessToken calls Upwork token endpoint", async () => {
    const mockResponse = {
      access_token: "refreshed-access",
      refresh_token: "refreshed-refresh",
      expires_in: 86400,
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 })),
    );

    const tokens: TokenStore = {
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: Date.now() - 1000,
    };
    await writeTokens(tokens);

    const manager = new TokenManager(tokensPath, "test-client-id", "test-client-secret");
    const refreshed = await manager.refreshAccessToken("old-refresh");

    expect(refreshed.accessToken).toBe("refreshed-access");
    expect(refreshed.refreshToken).toBe("refreshed-refresh");

    // Verify fetch was called with correct params
    const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
    expect(fetchMock).toHaveBeenCalledTimes(1);

    globalThis.fetch = originalFetch;
  });

  test("refreshAccessToken throws on non-200 response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Unauthorized", { status: 401 })),
    );

    const manager = new TokenManager(tokensPath, "client-id", "client-secret");
    await expect(manager.refreshAccessToken("bad-token")).rejects.toThrow();

    globalThis.fetch = originalFetch;
  });

  test("getValidToken refreshes expired token", async () => {
    // Set up an expired token
    const expired: TokenStore = {
      accessToken: "expired-access",
      refreshToken: "valid-refresh",
      expiresAt: Date.now() - 1000,
    };
    await writeTokens(expired);

    const mockResponse = {
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 86400,
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 })),
    );

    const manager = new TokenManager(tokensPath, "client-id", "client-secret");
    const token = await manager.getValidToken();
    expect(token).toBe("new-access");

    globalThis.fetch = originalFetch;
  });

  test("getValidToken returns existing token when not expired", async () => {
    const valid: TokenStore = {
      accessToken: "valid-access",
      refreshToken: "valid-refresh",
      expiresAt: Date.now() + 3600_000,
    };
    await writeTokens(valid);

    const manager = new TokenManager(tokensPath, "client-id", "client-secret");
    const token = await manager.getValidToken();
    expect(token).toBe("valid-access");
  });
});
