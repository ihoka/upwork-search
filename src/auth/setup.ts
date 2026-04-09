import { getConfig } from "../config.ts";
import { TokenManager } from "./oauth.ts";
import type { TokenStore } from "../types.ts";

const config = getConfig();

const authUrl = new URL("https://www.upwork.com/ab/account-security/oauth2/authorize");
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("client_id", config.clientId);
authUrl.searchParams.set("redirect_uri", config.redirectUri);

console.log("Opening browser for Upwork OAuth authorization...");
console.log(`URL: ${authUrl.toString()}\n`);

// Open browser
const proc = Bun.spawn(["open", authUrl.toString()]);
await proc.exited;

// Start local callback server
const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== "/callback") {
      return new Response("Not found", { status: 404 });
    }

    const code = url.searchParams.get("code");
    if (!code) {
      return new Response("Missing authorization code", { status: 400 });
    }

    console.log("Received authorization code. Exchanging for tokens...");

    try {
      // Exchange code for tokens
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });

      const response = await fetch("https://www.upwork.com/api/v3/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Token exchange failed (${response.status}): ${text}`);
      }

      const data = await response.json();
      const tokens: TokenStore = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      };

      const manager = new TokenManager(config.tokensPath, config.clientId, config.clientSecret);
      await manager.saveTokens(tokens);

      console.log(`\nTokens saved to ${config.tokensPath}`);
      console.log("Setup complete! You can now run: bun run search");

      // Shut down server after short delay
      setTimeout(() => {
        server.stop();
        process.exit(0);
      }, 1000);

      return new Response(
        "<html><body><h1>Authorization successful!</h1><p>You can close this tab.</p></body></html>",
        { headers: { "Content-Type": "text/html" } },
      );
    } catch (error) {
      console.error("Setup failed:", error);
      server.stop();
      process.exit(1);
      return new Response("Setup failed", { status: 500 });
    }
  },
});

console.log(`Waiting for callback on ${config.redirectUri}...`);
