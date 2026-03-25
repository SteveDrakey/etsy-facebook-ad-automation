import "dotenv/config";
import { config } from "../config.js";

const token = config.facebook.pageAccessToken();
const accountId = config.facebook.adAccountId();

async function fbGet(path: string) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`https://graph.facebook.com/v25.0/${path}${sep}access_token=${token}`);
  return res.json();
}

async function fbPost(path: string, params: any) {
  const res = await fetch(`https://graph.facebook.com/v25.0/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, access_token: token }),
  });
  return res.json();
}

const burjAdSetId = "52504298842782";

async function main() {
  // Check all active ad sets
  const filter = encodeURIComponent(
    JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE"] }])
  );
  const activeAdSets = await fbGet(
    `${accountId}/adsets?fields=id,name,status,campaign_id&filtering=${filter}&limit=50`
  );
  console.log("=== ALL ACTIVE AD SETS ===");
  for (const a of activeAdSets.data || []) {
    console.log(`${a.id} | ${a.name} | ${a.status}`);
  }

  // Pause everything except Burj Khalifa
  for (const a of activeAdSets.data || []) {
    if (a.id !== burjAdSetId) {
      const result = await fbPost(a.id, { status: "PAUSED" });
      console.log(`Paused ${a.name}:`, JSON.stringify(result));
    }
  }

  // Update Burj Khalifa: remove interest targeting, broad geo (exclude compliance regions)
  const updateResult = await fbPost(burjAdSetId, {
    targeting: {
      age_max: 65,
      age_min: 18,
      genders: [0],
      geo_locations: {
        country_groups: ["worldwide"],
        location_types: ["home", "recent"],
      },
      excluded_geo_locations: {
        countries: ["TW", "SG", "TH"],
        location_types: ["home"],
      },
      targeting_automation: {
        advantage_audience: 1,
      },
      publisher_platforms: ["facebook", "instagram", "audience_network", "messenger"],
      facebook_positions: [
        "feed", "biz_disco_feed", "facebook_reels", "facebook_reels_overlay",
        "profile_feed", "right_hand_column", "notification", "instream_video",
        "marketplace", "story", "search",
      ],
      instagram_positions: [
        "stream", "ig_search", "profile_reels", "story", "explore",
        "reels", "explore_home", "profile_feed",
      ],
      messenger_positions: ["story"],
      audience_network_positions: ["classic", "rewarded_video"],
    },
  });
  console.log("\nBurj Khalifa targeting update:", JSON.stringify(updateResult));

  // Verify final state
  const verify = await fbGet(
    `${burjAdSetId}?fields=id,name,status,optimization_goal,targeting,daily_budget`
  );
  const camp: any = await fbGet("52504298839982?fields=name,status,daily_budget");
  console.log("\n=== FINAL STATE ===");
  console.log(`Campaign: ${camp.name} | ${camp.status} | £${(camp.daily_budget / 100).toFixed(2)}/day`);
  console.log(`Ad set: ${verify.status} | ${verify.optimization_goal}`);
  const geo = verify.targeting?.geo_locations;
  console.log("Geo:", JSON.stringify(geo?.country_groups || geo?.countries));
  console.log("Interests:", JSON.stringify(verify.targeting?.flexible_spec || "none"));
  console.log(
    "Advantage audience:",
    verify.targeting?.targeting_automation?.advantage_audience === 1 ? "ON" : "OFF"
  );
}

main().catch(console.error);
