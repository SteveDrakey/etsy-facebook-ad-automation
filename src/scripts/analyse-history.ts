import { readFileSync } from "fs";

const data = JSON.parse(readFileSync("data/ad-history.json", "utf8"));

interface Row {
  name: string;
  status: string;
  objective: string;
  optGoal: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  ctr: string;
  cpc: string;
  cpm: string;
  frequency: string;
  costPerLink: string;
  postEngagement: number;
  interests: string;
  geo: string;
  dateRange: string;
}

const rows: Row[] = [];

for (const c of data) {
  const ins = c.insights?.[0];
  if (!ins) continue;

  const linkClicks = ins.actions?.find((a: any) => a.action_type === "link_click")?.value || 0;
  const postEngagement = ins.actions?.find((a: any) => a.action_type === "post_engagement")?.value || 0;
  const costPerLink = ins.cost_per_action_type?.find((a: any) => a.action_type === "link_click")?.value || 0;

  const adSet = c.adSets?.[0];
  const targeting = adSet?.targeting;
  const interests = targeting?.flexible_spec?.[0]?.interests?.map((i: any) => i.name) || [];
  const countries = targeting?.geo_locations?.countries || [];
  const countryGroups = targeting?.geo_locations?.country_groups || [];
  const geo = [...countries, ...countryGroups].join(", ") || "unknown";
  const optGoal = adSet?.optimization_goal || "unknown";

  rows.push({
    name: c.name.substring(0, 60),
    status: c.status,
    objective: c.objective,
    optGoal,
    spend: parseFloat(ins.spend),
    impressions: parseInt(ins.impressions),
    reach: parseInt(ins.reach),
    clicks: parseInt(ins.clicks),
    linkClicks: parseInt(linkClicks),
    ctr: parseFloat(ins.ctr).toFixed(2),
    cpc: parseFloat(ins.cpc || 0).toFixed(2),
    cpm: parseFloat(ins.cpm || 0).toFixed(2),
    frequency: parseFloat(ins.frequency || 0).toFixed(2),
    costPerLink: parseFloat(costPerLink).toFixed(2),
    postEngagement: parseInt(postEngagement),
    interests: interests.join(", ") || "none",
    geo,
    dateRange: ins.date_start + " to " + ins.date_stop,
  });
}

// Sort by link clicks descending
rows.sort((a, b) => b.linkClicks - a.linkClicks);

console.log("=== ALL CAMPAIGNS RANKED BY LINK CLICKS ===\n");
for (const r of rows) {
  console.log(r.name);
  console.log(`  Status: ${r.status} | Objective: ${r.objective} | Opt: ${r.optGoal}`);
  console.log(`  Spend: £${r.spend.toFixed(2)} | Impressions: ${r.impressions.toLocaleString()} | Reach: ${r.reach.toLocaleString()} | Freq: ${r.frequency}`);
  console.log(`  Clicks: ${r.clicks.toLocaleString()} | Link clicks: ${r.linkClicks.toLocaleString()} | CTR: ${r.ctr}% | CPC: £${r.cpc} | CPM: £${r.cpm}`);
  console.log(`  Cost/link click: £${r.costPerLink} | Post engagement: ${r.postEngagement.toLocaleString()}`);
  console.log(`  Interests: ${r.interests} | Geo: ${r.geo}`);
  console.log(`  Period: ${r.dateRange}`);
  console.log();
}

// Summary stats
console.log("=== KEY PATTERNS ===\n");

const withInterests = rows.filter((r) => r.interests !== "none" && r.linkClicks > 0);
const withoutInterests = rows.filter((r) => r.interests === "none" && r.linkClicks > 0);

if (withInterests.length) {
  const avgCPL = withInterests.reduce((s, r) => s + parseFloat(r.costPerLink), 0) / withInterests.length;
  const totalLinks = withInterests.reduce((s, r) => s + r.linkClicks, 0);
  console.log(`WITH interest targeting (${withInterests.length} campaigns):`);
  console.log(`  Total link clicks: ${totalLinks.toLocaleString()} | Avg cost/link: £${avgCPL.toFixed(3)}`);
}

if (withoutInterests.length) {
  const avgCPL = withoutInterests.reduce((s, r) => s + parseFloat(r.costPerLink), 0) / withoutInterests.length;
  const totalLinks = withoutInterests.reduce((s, r) => s + r.linkClicks, 0);
  console.log(`WITHOUT interest targeting (${withoutInterests.length} campaigns):`);
  console.log(`  Total link clicks: ${totalLinks.toLocaleString()} | Avg cost/link: £${avgCPL.toFixed(3)}`);
}

const skyscraperKeywords = ["burj", "tower", "park avenue", "skyline", "zun", "ryugyong", "trade center", "jeddah", "shanghai", "willis", "wrigley", "princess", "lotte"];
const skyscraper = rows.filter((r) => skyscraperKeywords.some((k) => r.name.toLowerCase().includes(k)) && r.linkClicks > 0);
const nonSkyscraper = rows.filter((r) => !skyscraperKeywords.some((k) => r.name.toLowerCase().includes(k)) && r.linkClicks > 0);

console.log(`\nSKYSCRAPER posts (${skyscraper.length} campaigns):`);
if (skyscraper.length) {
  const totalSpend = skyscraper.reduce((s, r) => s + r.spend, 0);
  const totalLinks = skyscraper.reduce((s, r) => s + r.linkClicks, 0);
  const totalReach = skyscraper.reduce((s, r) => s + r.reach, 0);
  console.log(`  Total spend: £${totalSpend.toFixed(2)} | Total link clicks: ${totalLinks.toLocaleString()} | Total reach: ${totalReach.toLocaleString()}`);
  console.log(`  Avg cost/link: £${(totalSpend / totalLinks).toFixed(3)}`);
}

console.log(`NON-SKYSCRAPER posts (${nonSkyscraper.length} campaigns):`);
if (nonSkyscraper.length) {
  const totalSpend = nonSkyscraper.reduce((s, r) => s + r.spend, 0);
  const totalLinks = nonSkyscraper.reduce((s, r) => s + r.linkClicks, 0);
  const totalReach = nonSkyscraper.reduce((s, r) => s + r.reach, 0);
  console.log(`  Total spend: £${totalSpend.toFixed(2)} | Total link clicks: ${totalLinks.toLocaleString()} | Total reach: ${totalReach.toLocaleString()}`);
  console.log(`  Avg cost/link: £${(totalSpend / totalLinks).toFixed(3)}`);
}
