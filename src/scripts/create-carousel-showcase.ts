/**
 * Create a Facebook ad campaign showcasing 20 Etsy listings as 2 carousel ads
 * (Facebook caps each carousel creative at 10 child cards).
 *
 * Output: 1 PAUSED campaign + 1 ad set + 2 ads (one per carousel), all PAUSED
 * so the user can review thumbnails, copy, and targeting in Ads Manager
 * before activating.
 *
 * Targeting is the worldwide-minus-SG/TH/TW pattern confirmed against the
 * user's live Ads Manager screenshot, with the rest of the targeting block
 * copied from the best-performing past ad ("Burj Khalifa" boost: 177 link
 * clicks at £0.05/click, OUTCOME_TRAFFIC).
 *
 * Dry-run by default. Use --apply to push to Facebook.
 *
 * Usage: npx tsx src/scripts/create-carousel-showcase.ts [--apply]
 */
import "dotenv/config";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "../config.js";
import { getListingImages } from "../etsy/client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INVENTORY_PATH = join(__dirname, "../../data/inventory.json");

const TOKEN = config.facebook.pageAccessToken();
const AD_ACCOUNT_ID = config.facebook.adAccountId();
const PAGE_ID = config.facebook.pageId();

// ─── 20 selected listings ──────────────────────────────────

interface Card {
  listingId: number;
  headline: string;
  description: string;
}

const CAROUSEL_A: Card[] = [
  { listingId: 1888876448, headline: "Burj Khalifa",        description: "Tallest in the world, 828m" },
  { listingId: 4423565972, headline: "Jeddah Tower",        description: "The 1000m supertall" },
  { listingId: 1887980746, headline: "Merdeka 118",         description: "2nd tallest, 679m" },
  { listingId: 4296407975, headline: "Shanghai Tower",      description: "China's tallest, 632m" },
  { listingId: 1889436528, headline: "Taipei 101",          description: "Taiwan icon, 508m" },
  { listingId: 1853095071, headline: "Lotte World Tower",   description: "Seoul's tallest, 555m" },
  { listingId: 4449043063, headline: "Petronas Towers",     description: "KL twin towers, 452m" },
  { listingId: 4342092939, headline: "One World Trade Ctr", description: "NYC supertall, 541m" },
  { listingId: 4342054584, headline: "Empire State",        description: "NYC art deco, 443m" },
  { listingId: 4377428270, headline: "Chrysler Building",   description: "NYC iconic spire, 319m" },
];

const CAROUSEL_B: Card[] = [
  { listingId: 4297238931, headline: "The Shard",            description: "London supertall, 310m" },
  { listingId: 4297239042, headline: "The Gherkin",          description: "30 St Mary Axe, 180m" },
  { listingId: 4297237780, headline: "Walkie Talkie",        description: "Top-heavy London, 160m" },
  { listingId: 4448475104, headline: "Canary Wharf",         description: "London skyline cluster" },
  { listingId: 4443853105, headline: "China Zun",            description: "Beijing's tallest, 528m" },
  { listingId: 4296348807, headline: "Oriental Pearl",       description: "Shanghai icon, 468m" },
  { listingId: 4428180735, headline: "Ryugyong Hotel",       description: "Pyongyang pyramid, 330m" },
  { listingId: 4460774490, headline: "432 Park Avenue",      description: "NYC supertall, 426m" },
  { listingId: 4426197221, headline: "WTC Twin Towers",      description: "Historic NYC pair" },
  { listingId: 4386384037, headline: "Goldin Finance 117",   description: "Tianjin tower, 597m" },
];

const MAIN_MESSAGE =
  "Detailed scale models of the world's most iconic skyscrapers — 3D printed to order in your choice of colour and size. Tap any building to see it in the shop.";

const TARGETING = {
  age_min: 18,
  age_max: 65,
  genders: [0],
  geo_locations: {
    country_groups: ["worldwide"],
    location_types: ["home", "recent"],
  },
  excluded_geo_locations: {
    countries: ["SG", "TH", "TW"],
    location_types: ["home", "recent"],
  },
  flexible_spec: [
    { interests: [{ id: "6003486530880", name: "Building (architecture)" }] },
  ],
  targeting_automation: { advantage_audience: 1 },
  publisher_platforms: ["facebook", "instagram", "audience_network", "messenger"],
};

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
    await sleep(250); // Etsy rate limit: ~10 req/s, stay well under
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

// ─── Main ──────────────────────────────────────────────────

async function main() {
  const apply = process.argv.includes("--apply");

  // Load inventory titles for sanity check
  const inv = JSON.parse(await readFile(INVENTORY_PATH, "utf-8"));
  const titles = new Map<number, string>(inv.map((l: any) => [l.listing_id, l.title]));

  console.log(apply ? "APPLY MODE — pushing to Facebook\n" : "DRY RUN — no API writes\n");
  console.log("=".repeat(70));
  console.log("Facebook Shop Showcase — 20 listings, 2 carousels, 1 campaign");
  console.log("=".repeat(70));
  console.log(`Page: ${PAGE_ID} | Ad Account: ${AD_ACCOUNT_ID}`);
  console.log(`Budget: £5/day | Status: PAUSED | Objective: OUTCOME_TRAFFIC\n`);

  console.log("Fetching listing images...");
  const aCards = await buildChildAttachments(CAROUSEL_A, titles);
  const bCards = await buildChildAttachments(CAROUSEL_B, titles);

  console.log("\nCarousel A — Supertalls + Icons:");
  for (const c of aCards) {
    const title = titles.get(parseInt(c.link.split("/").pop()!))!;
    console.log(`  ${c.name.padEnd(22)} ${c.description.padEnd(30)} ${title.slice(0, 40)}`);
  }
  console.log("\nCarousel B — London + Variety:");
  for (const c of bCards) {
    const title = titles.get(parseInt(c.link.split("/").pop()!))!;
    console.log(`  ${c.name.padEnd(22)} ${c.description.padEnd(30)} ${title.slice(0, 40)}`);
  }
  console.log(`\nMain ad copy:\n  "${MAIN_MESSAGE}"`);

  if (!apply) {
    console.log("\n🔒 DRY RUN — run with --apply to create the campaign.");
    return;
  }

  // 1. Create both creatives
  console.log("\nCreating creatives...");
  const creativeA = await createCreative("Shop Showcase A — Supertalls + Icons", aCards);
  console.log(`  ✅ Creative A: ${creativeA.id}`);
  const creativeB = await createCreative("Shop Showcase B — London + Variety", bCards);
  console.log(`  ✅ Creative B: ${creativeB.id}`);

  // 2. Create campaign (PAUSED)
  console.log("\nCreating campaign...");
  const campaign = await fbPost(`${AD_ACCOUNT_ID}/campaigns`, {
    name: "Drakey3DPrints — Shop Showcase 20",
    objective: "OUTCOME_TRAFFIC",
    status: "PAUSED",
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
  });
  console.log(`  ✅ Campaign: ${campaign.id}`);

  // 3. Create ad set (PAUSED, £5/day daily budget)
  console.log("Creating ad set...");
  const adSet = await fbPost(`${AD_ACCOUNT_ID}/adsets`, {
    name: "Showcase 20 — worldwide minus SG/TH/TW",
    campaign_id: campaign.id,
    daily_budget: "500",
    optimization_goal: "LANDING_PAGE_VIEWS",
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    status: "PAUSED",
    promoted_object: { page_id: PAGE_ID },
    targeting: TARGETING,
    start_time: new Date().toISOString(),
  });
  console.log(`  ✅ Ad Set: ${adSet.id}`);

  // 4. Create 2 ads (PAUSED)
  console.log("Creating ads...");
  const adA = await fbPost(`${AD_ACCOUNT_ID}/ads`, {
    name: "Showcase A — Supertalls + Icons",
    adset_id: adSet.id,
    creative: { creative_id: creativeA.id },
    status: "PAUSED",
  });
  console.log(`  ✅ Ad A: ${adA.id}`);
  const adB = await fbPost(`${AD_ACCOUNT_ID}/ads`, {
    name: "Showcase B — London + Variety",
    adset_id: adSet.id,
    creative: { creative_id: creativeB.id },
    status: "PAUSED",
  });
  console.log(`  ✅ Ad B: ${adB.id}`);

  const accountIdNumeric = AD_ACCOUNT_ID.replace("act_", "");
  console.log(`\n✅ Done — everything created in PAUSED state.`);
  console.log(`Review the campaign in Ads Manager:`);
  console.log(`  https://business.facebook.com/adsmanager/manage/campaigns?act=${accountIdNumeric}&selected_campaign_ids=${campaign.id}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
