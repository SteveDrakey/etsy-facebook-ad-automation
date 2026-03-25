/**
 * Etsy OAuth token management.
 * Auto-refreshes the access token when expired and saves to .env.
 */
import "dotenv/config";
import { readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, "../../.env");

const CLIENT_ID = process.env.ETSY_API_KEY!;

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Get a valid access token, refreshing automatically if expired.
 * Caches in memory so multiple calls in the same run don't re-refresh.
 */
export async function getAccessToken(): Promise<string> {
  // If we have a cached token that's still valid, use it
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  // Try the current token from env with a test call
  const currentToken = process.env.ETSY_ACCESS_TOKEN;
  if (currentToken) {
    const testRes = await fetch("https://api.etsy.com/v3/application/users/me", {
      headers: {
        "x-api-key": `${CLIENT_ID}:${process.env.ETSY_SHARED_SECRET}`,
        Authorization: `Bearer ${currentToken}`,
      },
    });

    if (testRes.ok) {
      cachedToken = currentToken;
      // Assume ~50 min remaining (we don't know exact expiry)
      tokenExpiresAt = Date.now() + 50 * 60 * 1000;
      return currentToken;
    }
  }

  // Token expired — refresh it
  const refreshToken = process.env.ETSY_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error(
      "No refresh token. Run: npx tsx src/scripts/etsy-auth.ts"
    );
  }

  console.log("Access token expired, refreshing...");

  const res = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Token refresh failed (${res.status}): ${body}\n` +
      "You may need to re-auth: npx tsx src/scripts/etsy-auth.ts"
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Update .env
  let env = await readFile(ENV_PATH, "utf-8");
  env = env.replace(
    /ETSY_ACCESS_TOKEN=.*/,
    `ETSY_ACCESS_TOKEN=${data.access_token}`
  );
  env = env.replace(
    /ETSY_REFRESH_TOKEN=.*/,
    `ETSY_REFRESH_TOKEN=${data.refresh_token}`
  );
  await writeFile(ENV_PATH, env);

  // Update process.env so other code in this run sees the new values
  process.env.ETSY_ACCESS_TOKEN = data.access_token;
  process.env.ETSY_REFRESH_TOKEN = data.refresh_token;

  // Cache it
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000; // 1 min buffer

  console.log(`Token refreshed (expires in ${Math.round(data.expires_in / 60)}m)\n`);

  return data.access_token;
}
