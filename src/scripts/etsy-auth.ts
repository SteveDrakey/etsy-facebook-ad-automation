/**
 * Etsy OAuth2 PKCE flow for personal access.
 * Opens a browser for you to approve, catches the callback,
 * exchanges for an access token, and saves to .env
 *
 * Usage: npx tsx src/scripts/etsy-auth.ts
 */
import "dotenv/config";
import { createServer } from "http";
import { randomBytes, createHash } from "crypto";
import { readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, "../../.env");

const CLIENT_ID = process.env.ETSY_API_KEY!;
const REDIRECT_URI = "http://localhost:3456/callback";
const SCOPES = "listings_r listings_w";
const PORT = 3456;

// ─── PKCE helpers ───────────────────────────────────────────
function generateVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generateChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// ─── Main flow ──────────────────────────────────────────────
async function main() {
  const codeVerifier = generateVerifier();
  const codeChallenge = generateChallenge(codeVerifier);
  const state = randomBytes(16).toString("hex");

  const authUrl =
    `https://www.etsy.com/oauth/connect` +
    `?response_type=code` +
    `&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&state=${state}` +
    `&code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256`;

  console.log("Opening browser for Etsy authorization...\n");
  console.log("If the browser doesn't open, visit this URL:\n");
  console.log(authUrl + "\n");

  // Open browser
  const { exec } = await import("child_process");
  exec(`start "" "${authUrl}"`);

  // Start local server to catch callback
  return new Promise<void>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${PORT}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400);
        res.end(`Error: ${error} - ${url.searchParams.get("error_description")}`);
        server.close();
        reject(new Error(error));
        return;
      }

      if (returnedState !== state) {
        res.writeHead(400);
        res.end("State mismatch - possible CSRF attack");
        server.close();
        reject(new Error("State mismatch"));
        return;
      }

      if (!code) {
        res.writeHead(400);
        res.end("No authorization code received");
        server.close();
        reject(new Error("No code"));
        return;
      }

      console.log("Authorization code received, exchanging for token...");

      // Exchange code for token
      try {
        const tokenRes = await fetch("https://api.etsy.com/v3/public/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            code: code,
            code_verifier: codeVerifier,
          }),
        });

        if (!tokenRes.ok) {
          const body = await tokenRes.text();
          throw new Error(`Token exchange failed: ${tokenRes.status} ${body}`);
        }

        const tokenData = await tokenRes.json() as {
          access_token: string;
          refresh_token: string;
          token_type: string;
          expires_in: number;
        };

        console.log("\nToken received!");
        console.log(`  Type: ${tokenData.token_type}`);
        console.log(`  Expires in: ${tokenData.expires_in}s (${Math.round(tokenData.expires_in / 3600)}h)`);

        // Save to .env
        let envContent = await readFile(ENV_PATH, "utf-8");

        // Add or update ETSY_ACCESS_TOKEN
        if (envContent.includes("ETSY_ACCESS_TOKEN=")) {
          envContent = envContent.replace(
            /ETSY_ACCESS_TOKEN=.*/,
            `ETSY_ACCESS_TOKEN=${tokenData.access_token}`
          );
        } else {
          envContent = envContent.replace(
            /ETSY_SHARED_SECRET=.*/,
            `ETSY_SHARED_SECRET=${process.env.ETSY_SHARED_SECRET}\nETSY_ACCESS_TOKEN=${tokenData.access_token}`
          );
        }

        // Add or update ETSY_REFRESH_TOKEN
        if (envContent.includes("ETSY_REFRESH_TOKEN=")) {
          envContent = envContent.replace(
            /ETSY_REFRESH_TOKEN=.*/,
            `ETSY_REFRESH_TOKEN=${tokenData.refresh_token}`
          );
        } else {
          envContent = envContent.replace(
            /ETSY_ACCESS_TOKEN=.*/,
            `ETSY_ACCESS_TOKEN=${tokenData.access_token}\nETSY_REFRESH_TOKEN=${tokenData.refresh_token}`
          );
        }

        await writeFile(ENV_PATH, envContent);
        console.log("\nSaved to .env:");
        console.log("  ETSY_ACCESS_TOKEN=..." + tokenData.access_token.slice(-10));
        console.log("  ETSY_REFRESH_TOKEN=..." + tokenData.refresh_token.slice(-10));

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>Etsy authorized!</h1><p>You can close this tab.</p>");
      } catch (err: any) {
        res.writeHead(500);
        res.end(`Error: ${err.message}`);
        server.close();
        reject(err);
        return;
      }

      server.close();
      resolve();
    });

    server.listen(PORT, () => {
      console.log(`Listening on http://localhost:${PORT}/callback for Etsy redirect...\n`);
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Timeout waiting for OAuth callback"));
    }, 120000);
  });
}

main()
  .then(() => {
    console.log("\nDone! You can now use authenticated Etsy API endpoints.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\nFailed:", err.message);
    process.exit(1);
  });
