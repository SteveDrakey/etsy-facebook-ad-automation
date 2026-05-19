/**
 * Create a draft Etsy listing for Ping An Finance Center (Shenzhen).
 *
 * Real height: 599m. Chamfered tapered tower with steel spire, wf=1.1.
 * Standard 7 tower scales. Mono-colour with 13 colour options.
 *
 * Prices are FIXED (anchored to China Zun shop pricing × 1.17 for taller form),
 * not derived from the raw √weight formula which underprices vs the shop.
 *
 * Dry-run by default. Use --apply to create on Etsy.
 *
 * Usage: npx tsx src/scripts/create-ping-an.ts [--apply]
 */
import "dotenv/config";
import { getAccessToken } from "../etsy/auth.js";

const API_KEY = `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`;
const BASE = "https://api.etsy.com/v3/application";
const SHOP_ID = 56796619;

// ─── Building profile ────────────────────────────────────────
const WIDTH_FACTOR = 1.1;
const REF_HEIGHT = 30;
const REF_WEIGHT = 39;
const SCALE_EXP = 2.5;
const REAL_HEIGHT_M = 599;

function estWeight(hCm: number): number {
  return REF_WEIGHT * Math.pow(hCm / REF_HEIGHT, SCALE_EXP) * Math.pow(WIDTH_FACTOR, 2);
}

// ─── Processing time tiers ───────────────────────────────────
const TIERS = [
  { maxWeight: 200, id: 1402849608497, label: "3-5 days" },
  { maxWeight: 500, id: 1416213279846, label: "5-7 days" },
  { maxWeight: 1000, id: 1403752122613, label: "1 week" },
  { maxWeight: 3000, id: 1413282949624, label: "1-2 weeks" },
  { maxWeight: Infinity, id: 1442956055906, label: "2-3 weeks" },
];

function tierForWeight(weightG: number) {
  return TIERS.find((t) => weightG < t.maxWeight) || TIERS[TIERS.length - 1];
}

// ─── Scales + fixed prices (shop-anchored) ───────────────────
// Anchored to China Zun pricing scaled by ~1.17 for Ping An's greater height
const SCALES: Array<{ ratio: number; price: number }> = [
  { ratio: 3000, price: 29 },
  { ratio: 2000, price: 43 },
  { ratio: 1200, price: 75 },
  { ratio: 1000, price: 94 },
  { ratio: 800, price: 122 },
  { ratio: 600, price: 170 },
  { ratio: 400, price: 278 },
];

function calcScale({ ratio, price }: { ratio: number; price: number }) {
  const heightCm = Math.round((REAL_HEIGHT_M / ratio) * 1000) / 10;
  const weightG = estWeight(heightCm);
  const tier = tierForWeight(weightG);
  const label = `1:${ratio} – ${heightCm} cm`;
  return { ratio, heightCm, label, price, weightG, readinessId: tier.id, readinessLabel: tier.label };
}

const COLOURS = [
  "Light Grey", "Silver", "Grey", "Bronze",
  "Ash Gray", "Blue Gray", "Cyan", "Jade White",
  "Tan", "Black", "Blue", "Transparent Blue",
  "Gold",
];

const SKU = "DRAK-046";

const TITLE = "Ping An Finance Center (Shenzhen) – 3D Printed Skyscraper Model";

const DESCRIPTION =
  "This 3D-printed model of Ping An Finance Center captures the sharp, chamfered form of one of the world’s tallest skyscrapers. At 599 metres in real life, it’s the fourth tallest building on the planet — and its stainless-steel cladding and tapered crown give it a precision that holds up beautifully even at smaller scales.\n\n" +
  "Choose a scale that fits your existing collection. If you’re building a supertall set, sticking to 1:1200 or 1:1000 keeps everything in proportion.";

const TAGS = [
  "ping an tower",
  "ping an finance",
  "shenzhen tower",
  "shenzhen skyline",
  "shenzhen landmark",
  "china souvenir",
  "tapered tower",
  "supertall model",
  "architecture gift",
  "gift for architect",
  "tower replica",
  "famous building",
  "travel souvenir",
];

// ─── Create listing + inventory ──────────────────────────────

async function main() {
  const apply = process.argv.includes("--apply");
  const token = await getAccessToken();

  const scaleInfo = SCALES.map(calcScale);

  console.log(apply ? "APPLY MODE — will create on Etsy\n" : "DRY RUN — no changes will be pushed\n");
  console.log("=".repeat(60));
  console.log(TITLE);
  console.log("=".repeat(60));
  console.log(`SKU: ${SKU} | Width factor: ${WIDTH_FACTOR} | Real height: ${REAL_HEIGHT_M}m`);
  console.log(`Colours: ${COLOURS.length} | Scales: ${scaleInfo.length} | Products: ${COLOURS.length * scaleInfo.length}\n`);

  console.log("Scale / Model Height / Price / Weight / Processing:");
  for (const s of scaleInfo) {
    const wStr = s.weightG < 1000 ? `~${Math.round(s.weightG)}g` : `~${(s.weightG / 1000).toFixed(1)}kg`;
    console.log(`  ${s.label.padEnd(22)} £${String(s.price).padEnd(5)} ${wStr.padEnd(8)} ${s.readinessLabel}`);
  }

  console.log(`\nDescription:\n${DESCRIPTION}\n`);
  console.log(`Tags: ${TAGS.join(", ")}\n`);

  if (!apply) {
    console.log("🔒 DRY RUN — run with --apply to create on Etsy.");
    return;
  }

  // Step 1: Create draft listing
  console.log("Creating draft listing...");

  const basePrice = scaleInfo[0].price;
  const body = new URLSearchParams();
  body.append("quantity", "999");
  body.append("title", TITLE);
  body.append("description", DESCRIPTION);
  body.append("price", String(basePrice));
  body.append("who_made", "i_did");
  body.append("when_made", "made_to_order");
  body.append("taxonomy_id", "130");
  body.append("shipping_profile_id", "260719988841");
  body.append("return_policy_id", "1341900298666");
  body.append("shop_section_id", "52394682");
  body.append("processing_min", "3");
  body.append("processing_max", "5");
  body.append("type", "physical");
  body.append("is_supply", "false");
  body.append("should_auto_renew", "true");
  body.append("readiness_state_id", "1402849608497");
  body.append("tags", TAGS.join(","));
  body.append("materials", "Plastic,Printed");

  const createRes = await fetch(`${BASE}/shops/${SHOP_ID}/listings`, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    console.error(`❌ Failed to create listing: ${createRes.status} ${text}`);
    return;
  }

  const listing = (await createRes.json()) as any;
  const listingId = listing.listing_id;
  console.log(`✅ Draft created! ID: ${listingId}`);

  // Step 2: Set up inventory (colour x scale)
  console.log("Setting up inventory...");

  const products = [];
  for (const colour of COLOURS) {
    for (const scale of scaleInfo) {
      products.push({
        sku: SKU,
        property_values: [
          {
            property_id: 200,
            property_name: "Primary color",
            value_ids: [] as number[],
            values: [colour],
            scale_id: null,
          },
          {
            property_id: 514,
            property_name: "Scale",
            value_ids: [] as number[],
            values: [scale.label],
            scale_id: null,
          },
        ],
        offerings: [
          {
            price: scale.price,
            quantity: 8,
            is_enabled: true,
            readiness_state_id: scale.readinessId,
          },
        ],
      });
    }
  }

  const invRes = await fetch(`${BASE}/listings/${listingId}/inventory`, {
    method: "PUT",
    headers: {
      "x-api-key": API_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      products,
      price_on_property: [514],
      quantity_on_property: [],
      sku_on_property: [],
      readiness_state_on_property: [514],
    }),
  });

  if (!invRes.ok) {
    const text = await invRes.text();
    console.error(`❌ Failed to set inventory: ${invRes.status} ${text}`);
    console.error(`Listing created but inventory needs manual setup. ID: ${listingId}`);
    return;
  }

  const invResult = (await invRes.json()) as any;
  const activeProducts = invResult.products.filter((p: any) => !p.is_deleted).length;
  console.log(`✅ Inventory set! ${activeProducts} products.`);
  console.log(`Draft: https://www.etsy.com/your/shops/Drakey3DPrints/tools/listings/${listingId}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
