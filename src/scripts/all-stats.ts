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

  for (const c of campaigns.data || []) {
    if (c.status === "DELETED") continue;
    console.log(`Campaign: ${c.name} (${c.status})\n`);

    const adSets = await fbGet(`${c.id}/adsets?fields=id,name,status,lifetime_budget,daily_budget,budget_remaining,start_time,end_time`);

    for (const adSet of adSets.data || []) {
      const lifetime = parseInt(adSet.lifetime_budget || "0");
      const daily = parseInt(adSet.daily_budget || "0");
      const budgetVal = lifetime || daily;
      const budgetType = lifetime ? "lifetime" : "daily";
      const budget = (budgetVal / 100).toFixed(2);
      const remaining = (parseInt(adSet.budget_remaining || "0") / 100).toFixed(2);
      const spent = (parseFloat(budget) - parseFloat(remaining)).toFixed(2);
      const end = adSet.end_time ? new Date(adSet.end_time).toLocaleDateString("en-GB") : "ongoing";

      console.log(`  Ad Set: ${adSet.name}`);
      console.log(`  Status: ${adSet.status}`);
      console.log(`  Budget: £${budget} (${budgetType}) | Spent: £${spent} | Remaining: £${remaining}`);
      console.log(`  Ends: ${end}`);

      const insights = await fbGet(`${adSet.id}/insights?fields=impressions,reach,clicks,spend,ctr,cpc,actions`);
      const d = insights.data?.[0];

      if (d) {
        console.log(`\n  Impressions: ${d.impressions}`);
        console.log(`  Reach: ${d.reach} people`);
        console.log(`  Clicks: ${d.clicks}`);
        console.log(`  CTR: ${d.ctr}%`);
        console.log(`  CPC: £${parseFloat(d.cpc || "0").toFixed(2)}`);
        console.log(`  Spend: £${d.spend}`);

        const linkClicks = d.actions?.find((a: any) => a.action_type === "link_click");
        if (linkClicks) {
          console.log(`  Link clicks: ${linkClicks.value}`);
        }
      } else {
        console.log(`\n  No data yet - ad may have just started.`);
      }
      console.log();
    }
  }
}

main().catch(console.error);
