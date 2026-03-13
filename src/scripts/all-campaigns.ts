import "dotenv/config";
import { config } from "../config.js";

const token = config.facebook.pageAccessToken();
const accountId = config.facebook.adAccountId();

async function fbGet(path: string): Promise<any> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`https://graph.facebook.com/v25.0/${path}${sep}access_token=${token}`);
  const data = await res.json();
  return data;
}

async function main() {
  const campaigns = await fbGet(`${accountId}/campaigns?fields=id,name,status,objective`);
  console.log("All campaigns:\n");
  for (const c of campaigns.data || []) {
    console.log(`  ${c.name}`);
    console.log(`    ID: ${c.id} | Status: ${c.status} | Objective: ${c.objective}`);

    const adSets = await fbGet(`${c.id}/adsets?fields=id,name,status,lifetime_budget,budget_remaining,start_time,end_time`);
    for (const a of adSets.data || []) {
      const budget = (parseInt(a.lifetime_budget || "0") / 100).toFixed(2);
      const remaining = (parseInt(a.budget_remaining || "0") / 100).toFixed(2);
      console.log(`    Ad Set: ${a.name} | Status: ${a.status} | Budget: £${budget} | Remaining: £${remaining}`);
    }
    console.log();
  }
}

main().catch(console.error);
