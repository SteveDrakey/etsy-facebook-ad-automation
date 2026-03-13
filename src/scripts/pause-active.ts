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
  // Get all active campaigns
  const campaigns = await fbGet(
    `${accountId}/campaigns?fields=id,name,status&effective_status=["ACTIVE"]&limit=50`
  );

  for (const c of campaigns.data || []) {
    console.log(`\nCampaign: ${c.name} (${c.id})`);

    // Get active ad sets
    const adSets = await fbGet(
      `${c.id}/adsets?fields=id,name,status&limit=50`
    );

    for (const adSet of adSets.data || []) {
      if (adSet.status === "ACTIVE") {
        console.log(`  Pausing ad set: ${adSet.name} (${adSet.id})`);
        const result = await fbPost(adSet.id, { status: "PAUSED" });
        if (result.success) {
          console.log(`  -> Paused successfully`);
        } else {
          console.log(`  -> Error: ${JSON.stringify(result)}`);
        }
      }
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
