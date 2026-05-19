/**
 * Create a draft Etsy listing for Two International Finance Centre (Two IFC),
 * Hong Kong.
 *
 * Real height: 415m. Tapered tower with distinctive notched crown, wf=1.2.
 * Standard 7 tower scales. Mono-colour with 13 colour options.
 *
 * Prices are FIXED (anchored to Jin Mao Tower shop pricing — near-identical
 * dimensions), not derived from the raw √weight formula.
 *
 * Title uses the full official name to avoid "2× models" confusion; description
 * opens with a clarifying note that this is a single building.
 *
 * Dry-run by default. Use --apply to create on Etsy.
 *
 * Usage: npx tsx src/scripts/create-two-ifc.ts [--apply]
 */
import "dotenv/config";
import { getAccessToken } from "../etsy/auth.js";

const API_KEY = `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`;
const BASE = "https://api.etsy.com/v3/application";
const SHOP_ID = 56796619;

// ─── Building profile ────────────────────────────────────────
const WIDTH_FACTOR = 1.2;
const REF_HEIGHT = 30;
const REF_WEIGHT = 39;
const SCALE_EXP = 2.5;
const REAL_HEIGHT_M = 415;

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

// ─── Scales + fixed prices (shop-anchored to Jin Mao) ────────
const SCALES: Array<{ ratio: number; price: number }> = [
  { ratio: 3000, price: 21 },
  { ratio: 2000, price: 32 },
  { ratio: 1200, price: 54 },
  { ratio: 1000, price: 67 },
  { ratio: 800, price: 86 },
  { ratio: 600, price: 121 },
  { ratio: 400, price: 197 },
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

const SKU = "DRAK-048";

const TITLE = "Two International Finance Centre (Hong Kong) – 3D Printed Skyscraper Model";

const DESCRIPTION =
  "Note: \"Two International Finance Centre\" is the official name of a single building — the taller of two towers in Hong Kong’s IFC complex. This listing is for one model, not a pair.\n\n" +
  "This 3D-printed model of Two International Finance Centre captures the distinctive notched crown of Hong Kong’s iconic Central tower. At 415 metres in real life, it closes off the Hong Kong Island skyline opposite ICC across Victoria Harbour.\n\n" +
  "The crown detail is what defines this one, and it holds up cleanly even at smaller scales. Pair with the ICC model for the complete Victoria Harbour bookend.";

const TAGS = [
  "two ifc model",
  "ifc hong kong",
  "ifc skyscraper",
  "hong kong skyline",
  "hong kong gift",
  "hong kong landmark",
  "central hong kong",
  "crown top tower",
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
