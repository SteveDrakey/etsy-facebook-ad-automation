/**
 * One-off: replace the carousel creatives on the Showcase 20 campaign with
 * fresh ones that have the corrected "Detailed" (not "Handmade") copy.
 *
 * Facebook creative messages are immutable post-creation, so we build new
 * creatives with the same 20 cards/images and then PATCH the existing 2 ads
 * to point at the new creative IDs. Both ads + the campaign stay PAUSED.
 *
 * Usage: npx tsx src/scripts/update-carousel-copy.ts [--apply]
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

// Existing live ads on the Showcase 20 campaign — both PAUSED
const AD_A_ID = "52556235354982";
const AD_B_ID = "52556235359382";

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

const NEW_MAIN_MESSAGE =
  "Detailed scale models of the world's most iconic skyscrapers — 3D printed to order in your choice of colour and size. Tap any building to see it in the shop.";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

async function buildChildAttachments(cards: Card[], titles: Map<number, string>) {
  const result = [];
  for (const card of cards) {
    if (!titles.has(card.listingId)) throw new Error(`Listing ${card.listingId} not in inventory.json`);
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

async function createCreative(name: string, childAttachments: any[]): Promise<{ id: string }> {
  return fbPost(`${AD_ACCOUNT_ID}/adcreatives`, {
    name,
    object_story_spec: {
      page_id: PAGE_ID,
      link_data: {
        message: NEW_MAIN_MESSAGE,
        link: "https://www.etsy.com/shop/Drakey3DPrints",
        child_attachments: childAttachments,
        multi_share_optimized: true,
      },
    },
  });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const inv = JSON.parse(await readFile(INVENTORY_PATH, "utf-8"));
  const titles = new Map<number, string>(inv.map((l: any) => [l.listing_id, l.title]));

  console.log(apply ? "APPLY MODE\n" : "DRY RUN\n");
  console.log(`New copy:\n  "${NEW_MAIN_MESSAGE}"\n`);
  console.log(`Will replace creatives on:`);
  console.log(`  Ad A: ${AD_A_ID} (Supertalls + Icons)`);
  console.log(`  Ad B: ${AD_B_ID} (London + Variety)`);

  if (!apply) {
    console.log("\n🔒 DRY RUN — run with --apply to push to Facebook.");
    return;
  }

  console.log("\nFetching listing images...");
  const aCards = await buildChildAttachments(CAROUSEL_A, titles);
  const bCards = await buildChildAttachments(CAROUSEL_B, titles);

  console.log("\nCreating replacement creatives...");
  const creativeA = await createCreative("Shop Showcase A — Supertalls + Icons (v2)", aCards);
  console.log(`  ✅ Creative A: ${creativeA.id}`);
  const creativeB = await createCreative("Shop Showcase B — London + Variety (v2)", bCards);
  console.log(`  ✅ Creative B: ${creativeB.id}`);

  console.log("\nUpdating existing ads to point at new creatives...");
  await fbPost(AD_A_ID, { creative: { creative_id: creativeA.id } });
  console.log(`  ✅ Ad A (${AD_A_ID}) now uses creative ${creativeA.id}`);
  await fbPost(AD_B_ID, { creative: { creative_id: creativeB.id } });
  console.log(`  ✅ Ad B (${AD_B_ID}) now uses creative ${creativeB.id}`);

  console.log(`\n✅ Done. Ads still PAUSED. Copy updated.`);
}

main().catch((err) => { console.error("Error:", err.message); process.exit(1); });
