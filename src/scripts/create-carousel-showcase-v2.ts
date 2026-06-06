/**
 * v2 of the carousel showcase ad — different 20 listings (none overlap with v1),
 * different ad copy, and targeting that mirrors the live state of the v1 ad set
 * (37 high-converting Etsy markets: EU27 + UK + US + CA + AU + NZ + JP + CH +
 * NO + IS + LI) rather than the v1 script's worldwide-minus-SG/TH/TW which the
 * user had already narrowed in the Ads Manager UI.
 *
 * Creates everything ACTIVE (not PAUSED) so it starts delivering immediately.
 * On --apply, appends a structured record to data/carousel-ads-log.json so the
 * full history of carousel ads is git-tracked.
 *
 * Dry-run by default. Use --apply to push to Facebook.
 *
 * Usage: npx tsx src/scripts/create-carousel-showcase-v2.ts [--apply]
 */
import "dotenv/config";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "../config.js";
import { getListingImages } from "../etsy/client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INVENTORY_PATH = join(__dirname, "../../data/inventory.json");
const LOG_PATH = join(__dirname, "../../data/carousel-ads-log.json");

const TOKEN = config.facebook.pageAccessToken();
const AD_ACCOUNT_ID = config.facebook.adAccountId();
const PAGE_ID = config.facebook.pageId();

// ─── 20 selected listings (none in v1 carousel) ────────────

interface Card {
  listingId: number;
  headline: string;
  description: string;
}

const CAROUSEL_C: Card[] = [
  { listingId: 4377435439, headline: "Chrysler Full Colour",  description: "NYC art deco in vivid colour, 319m" },
  { listingId: 4298120344, headline: "Willis Tower FC",       description: "Chicago supertall, full colour, 442m" },
  { listingId: 4419072894, headline: "Shanghai WFC FC",       description: "'The bottle opener', 492m" },
  { listingId: 4420044814, headline: "One WTC Full Colour",   description: "NYC supertall, full colour, 541m" },
  { listingId: 4475385059, headline: "Merdeka 118 Shiny",     description: "KL supertall, shiny multi-colour" },
  { listingId: 4300220861, headline: "Lotte World Multi",     description: "Seoul tallest, multi-colour, 555m" },
  { listingId: 4334171055, headline: "Gherkin in Colour",     description: "London icon in vivid colour, 180m" },
  { listingId: 4340595685, headline: "Leadenhall FC",         description: "'The Cheesegrater', full colour, 225m" },
  { listingId: 4316928048, headline: "St Peter's & Square",   description: "Vatican basilica with St Peter's Sq" },
  { listingId: 4368628516, headline: "NYC Times Square",      description: "Times Square cityscape model" },
];

const CAROUSEL_D: Card[] = [
  { listingId: 4374780060, headline: "Flatiron Building",     description: "NYC's wedge-shaped icon, 87m" },
  { listingId: 4486855593, headline: "Santa Ana Cathedral",   description: "El Salvador neo-gothic facade" },
  { listingId: 4487013910, headline: "Sagrada Familia",       description: "Gaudí's Barcelona basilica facade" },
  { listingId: 4297236300, headline: "Wrigley Field",         description: "Chicago's historic baseball stadium" },
  { listingId: 4410415496, headline: "Hancock Tower",         description: "Chicago supertall, 344m" },
  { listingId: 4405247320, headline: "Gevora Hotel",          description: "World's tallest hotel, Dubai, 356m" },
  { listingId: 4328792291, headline: "Princess Tower",        description: "Dubai supertall, 414m" },
  { listingId: 4296343052, headline: "Jin Mao Tower",         description: "Shanghai pagoda-inspired, 421m" },
  { listingId: 4485639625, headline: "Grollo Tower 1997",     description: "Melbourne unbuilt design, 1997" },
  { listingId: 4485639629, headline: "Grollo Tower 2001",     description: "Melbourne unbuilt design, 2001" },
];

const MAIN_MESSAGE =
  "Full-colour 3D printed buildings — from Chicago supertalls to Barcelona basilica facades, printed to order in your choice of colour and size. Tap any model to see it in the shop.";

// Live targeting fetched from Facebook on 2026-06-06 for the v1 Showcase 20
// ad set: EU27 + UK + US + Canada + Australia + NZ + Japan + Switzerland +
// Norway + Iceland + Liechtenstein. 37 markets total.
const TARGETING_COUNTRIES = [
  "US", "GB", "IE", "CA", "AU", "NZ", "JP", "CH", "NO", "IS", "LI",
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE",
  "GR", "HU", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO",
  "SK", "SI", "ES", "SE",
];

const TARGETING = {
  age_min: 18,
  age_max: 65,
  genders: [0],
  geo_locations: {
    countries: TARGETING_COUNTRIES,
    location_types: ["home", "recent"],
  },
  flexible_spec: [
    { interests: [{ id: "6003486530880", name: "Building (architecture)" }] },
  ],
  targeting_automation: { advantage_audience: 1 },
  publisher_platforms: ["facebook", "instagram", "audience_network", "messenger"],
};

const CAMPAIGN_NAME = "Drakey3DPrints — Shop Showcase 20 v2";
const ADSET_NAME = "Showcase 20 v2 — EU27+UK+US+CA+AU+NZ+JP+CH+NO+IS+LI";
const AD_C_NAME = "Showcase C — Full-Colour Editions";
const AD_D_NAME = "Showcase D — Landmarks & Variety";
const CREATIVE_C_NAME = "Shop Showcase C — Full-Colour Editions";
const CREATIVE_D_NAME = "Shop Showcase D — Landmarks & Variety";

// ─── Facebook API helper ───────────────────────────────────

async function fbPost(path: string, body: Record<string, any>): Promise<any> {
  const url = `https://graph.facebook.com/v25.0/${path}`;
  const params = new URLSearchParams({ access_token: TOKEN });
  for (const [k, v] of Object.entries(body)) {
    params.append(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  const res = await fetch(url, { method: "POST", body: params });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error(`FB POST ${path}: non-JSON ${res.status}: ${text.slice(0, 300)}`); }
  if (!res.ok || data.error) throw new Error(`FB POST ${path} ${res.status}: ${JSON.stringify(data.error || data).slice(0, 500)}`);
  return data;
}

// ─── Build carousel child attachments ──────────────────────

interface ChildAttachment {
  name: string;
  description: string;
  link: string;
  image_url: string;
  call_to_action: { type: string; value: { link: string } };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function buildChildAttachments(cards: Card[], titles: Map<number, string>): Promise<ChildAttachment[]> {
  const result: ChildAttachment[] = [];
  for (const card of cards) {
    if (!titles.has(card.listingId)) {
      throw new Error(`Listing ${card.listingId} not in inventory.json`);
    }
    const images = await getListingImages(card.listingId);
    if (!images.length) throw new Error(`No images for listing ${card.listingId}`);
    const link = `https://www.etsy.com/listing/${card.listingId}`;
    result.push({
      name: card.headline,
      description: card.description,
      link,
      image_url: images[0].url_570xN,
      call_to_action: { type: "SHOP_NOW", value: { link } },
    });
    await sleep(250);
  }
  return result;
}

async function createCreative(name: string, childAttachments: ChildAttachment[]): Promise<{ id: string }> {
  return fbPost(`${AD_ACCOUNT_ID}/adcreatives`, {
    name,
    object_story_spec: {
      page_id: PAGE_ID,
      link_data: {
        message: MAIN_MESSAGE,
        link: "https://www.etsy.com/shop/Drakey3DPrints",
        child_attachments: childAttachments,
        multi_share_optimized: true,
      },
    },
  });
}

// ─── Ad history log ────────────────────────────────────────

interface AdLogEntry {
  createdAt: string;
  script: string;
  campaignId: string;
  campaignName: string;
  adSetId: string;
  adSetName: string;
  dailyBudgetGBP: number;
  status: string;
  objective: string;
  optimizationGoal: string;
  targeting: {
    countries: string[];
    interests: string[];
    advantageAudience: boolean;
    ageRange: string;
    publisherPlatforms: string[];
  };
  ads: Array<{
    adId: string;
    adName: string;
    creativeId: string;
    creativeName: string;
    message: string;
    landingLink: string;
    listings: Array<{ listingId: number; headline: string; title: string }>;
  }>;
}

async function appendLog(entry: AdLogEntry): Promise<void> {
  let log: AdLogEntry[] = [];
  if (existsSync(LOG_PATH)) {
    const raw = await readFile(LOG_PATH, "utf-8");
    if (raw.trim()) log = JSON.parse(raw);
  }
  log.push(entry);
  await writeFile(LOG_PATH, JSON.stringify(log, null, 2) + "\n", "utf-8");
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  const apply = process.argv.includes("--apply");

  const inv = JSON.parse(await readFile(INVENTORY_PATH, "utf-8"));
  const titles = new Map<number, string>(inv.map((l: any) => [l.listing_id, l.title]));

  console.log(apply ? "APPLY MODE — pushing to Facebook\n" : "DRY RUN — no API writes\n");
  console.log("=".repeat(70));
  console.log("Facebook Shop Showcase v2 — 20 listings, 2 carousels, 1 campaign");
  console.log("=".repeat(70));
  console.log(`Page: ${PAGE_ID} | Ad Account: ${AD_ACCOUNT_ID}`);
  console.log(`Budget: £5/day | Status: ACTIVE | Objective: OUTCOME_TRAFFIC`);
  console.log(`Targeting: ${TARGETING_COUNTRIES.length} countries (EU27+UK+US+CA+AU+NZ+JP+CH+NO+IS+LI), Advantage+ on\n`);

  console.log("Fetching listing images...");
  const cCards = await buildChildAttachments(CAROUSEL_C, titles);
  const dCards = await buildChildAttachments(CAROUSEL_D, titles);

  console.log("\nCarousel C — Full-Colour Editions:");
  for (const c of cCards) {
    const title = titles.get(parseInt(c.link.split("/").pop()!))!;
    console.log(`  ${c.name.padEnd(22)} ${c.description.padEnd(38)} ${title.slice(0, 40)}`);
  }
  console.log("\nCarousel D — Landmarks & Variety:");
  for (const c of dCards) {
    const title = titles.get(parseInt(c.link.split("/").pop()!))!;
    console.log(`  ${c.name.padEnd(22)} ${c.description.padEnd(38)} ${title.slice(0, 40)}`);
  }
  console.log(`\nMain ad copy:\n  "${MAIN_MESSAGE}"`);

  if (!apply) {
    console.log("\n🔒 DRY RUN — run with --apply to create the campaign.");
    return;
  }

  console.log("\nCreating creatives...");
  const creativeC = await createCreative(CREATIVE_C_NAME, cCards);
  console.log(`  ✅ Creative C: ${creativeC.id}`);
  const creativeD = await createCreative(CREATIVE_D_NAME, dCards);
  console.log(`  ✅ Creative D: ${creativeD.id}`);

  console.log("\nCreating campaign...");
  const campaign = await fbPost(`${AD_ACCOUNT_ID}/campaigns`, {
    name: CAMPAIGN_NAME,
    objective: "OUTCOME_TRAFFIC",
    status: "ACTIVE",
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
  });
  console.log(`  ✅ Campaign: ${campaign.id}`);

  console.log("Creating ad set...");
  const adSet = await fbPost(`${AD_ACCOUNT_ID}/adsets`, {
    name: ADSET_NAME,
    campaign_id: campaign.id,
    daily_budget: "500",
    optimization_goal: "LANDING_PAGE_VIEWS",
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    status: "ACTIVE",
    promoted_object: { page_id: PAGE_ID },
    targeting: TARGETING,
    start_time: new Date().toISOString(),
  });
  console.log(`  ✅ Ad Set: ${adSet.id}`);

  console.log("Creating ads...");
  const adC = await fbPost(`${AD_ACCOUNT_ID}/ads`, {
    name: AD_C_NAME,
    adset_id: adSet.id,
    creative: { creative_id: creativeC.id },
    status: "ACTIVE",
  });
  console.log(`  ✅ Ad C: ${adC.id}`);
  const adD = await fbPost(`${AD_ACCOUNT_ID}/ads`, {
    name: AD_D_NAME,
    adset_id: adSet.id,
    creative: { creative_id: creativeD.id },
    status: "ACTIVE",
  });
  console.log(`  ✅ Ad D: ${adD.id}`);

  console.log("\nWriting log entry to data/carousel-ads-log.json...");
  await appendLog({
    createdAt: new Date().toISOString(),
    script: "create-carousel-showcase-v2",
    campaignId: campaign.id,
    campaignName: CAMPAIGN_NAME,
    adSetId: adSet.id,
    adSetName: ADSET_NAME,
    dailyBudgetGBP: 5,
    status: "ACTIVE",
    objective: "OUTCOME_TRAFFIC",
    optimizationGoal: "LANDING_PAGE_VIEWS",
    targeting: {
      countries: TARGETING_COUNTRIES,
      interests: ["Building (architecture)"],
      advantageAudience: true,
      ageRange: "18-65",
      publisherPlatforms: TARGETING.publisher_platforms,
    },
    ads: [
      {
        adId: adC.id,
        adName: AD_C_NAME,
        creativeId: creativeC.id,
        creativeName: CREATIVE_C_NAME,
        message: MAIN_MESSAGE,
        landingLink: "https://www.etsy.com/shop/Drakey3DPrints",
        listings: CAROUSEL_C.map((c) => ({ listingId: c.listingId, headline: c.headline, title: titles.get(c.listingId) || "" })),
      },
      {
        adId: adD.id,
        adName: AD_D_NAME,
        creativeId: creativeD.id,
        creativeName: CREATIVE_D_NAME,
        message: MAIN_MESSAGE,
        landingLink: "https://www.etsy.com/shop/Drakey3DPrints",
        listings: CAROUSEL_D.map((c) => ({ listingId: c.listingId, headline: c.headline, title: titles.get(c.listingId) || "" })),
      },
    ],
  });
  console.log("  ✅ Log appended");

  const accountIdNumeric = AD_ACCOUNT_ID.replace("act_", "");
  console.log(`\n✅ Done — campaign ACTIVE, spend starts now.`);
  console.log(`Review in Ads Manager:`);
  console.log(`  https://business.facebook.com/adsmanager/manage/campaigns?act=${accountIdNumeric}&selected_campaign_ids=${campaign.id}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
