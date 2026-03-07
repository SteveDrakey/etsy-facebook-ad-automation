/**
 * Show performance stats for all active and recent ads.
 * Usage: npx tsx src/scripts/stats.ts
 */
import "dotenv/config";
import { config } from "../config.js";

const token = config.facebook.pageAccessToken();
const accountId = config.facebook.adAccountId();

async function fbGet(path: string): Promise<any> {
  const res = await fetch(`https://graph.facebook.com/v25.0/${path}&access_token=${token}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Facebook API ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(`Facebook API: ${data.error.message}`);
  return data;
}

async function main() {
  // Get all ad sets under our campaign
  const campaigns = await fbGet(`${accountId}/campaigns?fields=id,name,status&filtering=[{"field":"name","operator":"CONTAIN","value":"Drakey3DPrints"}]`);

  if (!campaigns.data?.length) {
    console.log("No campaigns found.");
    return;
  }

  for (const campaign of campaigns.data) {
    console.log(`Campaign: ${campaign.name} (${campaign.status})\n`);

    const adSets = await fbGet(`${campaign.id}/adsets?fields=id,name,status,lifetime_budget,budget_remaining,start_time,end_time`);

    for (const adSet of adSets.data || []) {
      const budget = (parseInt(adSet.lifetime_budget || "0") / 100).toFixed(2);
      const remaining = (parseInt(adSet.budget_remaining || "0") / 100).toFixed(2);
      const spent = (parseFloat(budget) - parseFloat(remaining)).toFixed(2);
      const end = new Date(adSet.end_time).toLocaleDateString("en-GB");

      console.log(`  Ad Set: ${adSet.name}`);
      console.log(`  Status: ${adSet.status}`);
      console.log(`  Budget: £${budget} | Spent: £${spent} | Remaining: £${remaining}`);
      console.log(`  Ends: ${end}`);

      // Get insights for this ad set
      const insights = await fbGet(`${adSet.id}/insights?fields=impressions,reach,clicks,spend,ctr,cpc,actions`);
      const d = insights.data?.[0];

      if (d) {
        console.log(`\n  Impressions: ${d.impressions}`);
        console.log(`  Reach: ${d.reach} people`);
        console.log(`  Clicks: ${d.clicks}`);
        console.log(`  CTR: ${d.ctr}%`);
        console.log(`  CPC: £${parseFloat(d.cpc || "0").toFixed(2)}`);

        const linkClicks = d.actions?.find((a: any) => a.action_type === "link_click");
        if (linkClicks) {
          console.log(`  Link clicks: ${linkClicks.value}`);
        }
      } else {
        console.log(`\n  No data yet - ad may have just started.`);
      }

      // Get ads under this ad set with delivery status
      const ads = await fbGet(
        `${adSet.id}/ads?fields=id,name,status,effective_status,ad_review_feedback`
      );

      for (const ad of ads.data || []) {
        console.log(`\n  Ad: ${ad.name}`);
        console.log(`    Status: ${ad.status} | Effective: ${ad.effective_status}`);
        if (ad.ad_review_feedback?.global) {
          console.log(`    Review feedback: ${JSON.stringify(ad.ad_review_feedback.global)}`);
        }
      }

      console.log();
    }
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
