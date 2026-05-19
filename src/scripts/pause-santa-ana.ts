/**
 * Pause the ACTIVE "Santa Ana Cathedral Boost" campaign (campaign-level).
 * Leaves other campaigns (Burj, Drakey3DPrints Boosts, etc.) untouched.
 * Usage: npx tsx src/scripts/pause-santa-ana.ts
 */
import "dotenv/config";
import { config } from "../config.js";

const token = config.facebook.pageAccessToken();
const accountId = config.facebook.adAccountId();

async function fbGet(path: string) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(
    `https://graph.facebook.com/v25.0/${path}${sep}access_token=${token}`
  );
  return res.json();
}

async function fbPost(path: string, body: Record<string, string>) {
  const params = new URLSearchParams({ ...body, access_token: token });
  const res = await fetch(`https://graph.facebook.com/v25.0/${path}`, {
    method: "POST",
    body: params,
  });
  return res.json();
}

async function main() {
  const campaigns = await fbGet(
    `${accountId}/campaigns?fields=id,name,status&limit=100`
  );

  const targets = (campaigns.data || []).filter(
    (c: { name: string; status: string }) =>
      c.name === "Santa Ana Cathedral Boost" && c.status === "ACTIVE"
  );

  if (targets.length === 0) {
    console.log("No ACTIVE 'Santa Ana Cathedral Boost' campaign found.");
    return;
  }

  for (const c of targets) {
    console.log(`Pausing campaign: ${c.name} (${c.id})`);
    const result = await fbPost(c.id, { status: "PAUSED" });
    if (result.success) {
      console.log("  -> Paused successfully");
    } else {
      console.log(`  -> Error: ${JSON.stringify(result)}`);
    }
  }
}

main().catch(console.error);
