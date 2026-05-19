/**
 * One-off: add 1:2000 scale to the existing HSBC draft (listing 4507963269).
 *
 * Etsy PUT /listings/{id}/inventory replaces the entire product set, so we
 * rebuild the full 13-colour × 6-scale matrix and push it.
 *
 * Usage: npx tsx src/scripts/update-hsbc-add-2000.ts [--apply]
 */
import "dotenv/config";
import { getAccessToken } from "../etsy/auth.js";

const API_KEY = `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`;
const BASE = "https://api.etsy.com/v3/application";
const LISTING_ID = 4507963269;
const SKU = "DRAK-049";
const WIDTH_FACTOR = 1.6;
const REAL_HEIGHT_M = 178.8;

function estWeight(hCm: number): number {
  return 39 * Math.pow(hCm / 30, 2.5) * Math.pow(WIDTH_FACTOR, 2);
}

const TIERS = [
  { maxWeight: 200, id: 1402849608497 },
  { maxWeight: 500, id: 1416213279846 },
  { maxWeight: 1000, id: 1403752122613 },
  { maxWeight: 3000, id: 1413282949624 },
  { maxWeight: Infinity, id: 1442956055906 },
];

function tierForWeight(weightG: number) {
  return TIERS.find((t) => weightG < t.maxWeight) || TIERS[TIERS.length - 1];
}

const SCALES: Array<{ ratio: number; price: number }> = [
  { ratio: 2000, price: 17 },
  { ratio: 1200, price: 28 },
  { ratio: 1000, price: 33 },
  { ratio: 800, price: 43 },
  { ratio: 600, price: 59 },
  { ratio: 400, price: 93 },
];

const COLOURS = [
  "Light Grey", "Silver", "Grey", "Bronze",
  "Ash Gray", "Blue Gray", "Cyan", "Jade White",
  "Tan", "Black", "Blue", "Transparent Blue",
  "Gold",
];

async function main() {
  const apply = process.argv.includes("--apply");
  const token = await getAccessToken();

  const scaleInfo = SCALES.map(({ ratio, price }) => {
    const heightCm = Math.round((REAL_HEIGHT_M / ratio) * 1000) / 10;
    const weightG = estWeight(heightCm);
    const tier = tierForWeight(weightG);
    return { ratio, heightCm, label: `1:${ratio} – ${heightCm} cm`, price, readinessId: tier.id };
  });

  console.log(apply ? "APPLY MODE\n" : "DRY RUN\n");
  console.log(`Listing: ${LISTING_ID}`);
  console.log(`Pushing ${COLOURS.length} colours × ${scaleInfo.length} scales = ${COLOURS.length * scaleInfo.length} products\n`);
  for (const s of scaleInfo) console.log(`  ${s.label.padEnd(22)} £${s.price}`);

  if (!apply) {
    console.log("\n🔒 DRY RUN — run with --apply to push to Etsy.");
    return;
  }

  const products = [];
  for (const colour of COLOURS) {
    for (const scale of scaleInfo) {
      products.push({
        sku: SKU,
        property_values: [
          { property_id: 200, property_name: "Primary color", value_ids: [], values: [colour], scale_id: null },
          { property_id: 514, property_name: "Scale", value_ids: [], values: [scale.label], scale_id: null },
        ],
        offerings: [{ price: scale.price, quantity: 8, is_enabled: true, readiness_state_id: scale.readinessId }],
      });
    }
  }

  const invRes = await fetch(`${BASE}/listings/${LISTING_ID}/inventory`, {
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
    console.error(`❌ Failed: ${invRes.status} ${await invRes.text()}`);
    return;
  }

  const result = (await invRes.json()) as any;
  const active = result.products.filter((p: any) => !p.is_deleted).length;
  console.log(`\n✅ Inventory updated! ${active} products.`);
  console.log(`Draft: https://www.etsy.com/your/shops/Drakey3DPrints/tools/listings/${LISTING_ID}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
