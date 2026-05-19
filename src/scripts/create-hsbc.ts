/**
 * Create a draft Etsy listing for the HSBC Main Building, Hong Kong.
 *
 * Real height: 178.8m. Foster + Partners (1985), stocky rectangular form with
 * exposed steel exoskeleton, wf=1.6.
 *
 * 6 scales — 1:3000 dropped (6 cm is too small for the truss detail). 1:2000
 * (8.9 cm) included as a budget entry option. Mono-colour with 13 colour options.
 *
 * Prices are FIXED (anchored to The Gherkin shop pricing × 0.89), not derived
 * from the raw √weight formula.
 *
 * Dry-run by default. Use --apply to create on Etsy.
 *
 * Usage: npx tsx src/scripts/create-hsbc.ts [--apply]
 */
import "dotenv/config";
import { getAccessToken } from "../etsy/auth.js";

const API_KEY = `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`;
const BASE = "https://api.etsy.com/v3/application";
const SHOP_ID = 56796619;

// ─── Building profile ────────────────────────────────────────
const WIDTH_FACTOR = 1.6;
const REF_HEIGHT = 30;
const REF_WEIGHT = 39;
const SCALE_EXP = 2.5;
const REAL_HEIGHT_M = 178.8;

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

// ─── Scales + fixed prices (shop-anchored to Gherkin × 0.89) ─
// 1:3000 dropped — at 6 cm the exoskeleton truss detail is lost
const SCALES: Array<{ ratio: number; price: number }> = [
  { ratio: 2000, price: 17 },
  { ratio: 1200, price: 28 },
  { ratio: 1000, price: 33 },
  { ratio: 800, price: 43 },
  { ratio: 600, price: 59 },
  { ratio: 400, price: 93 },
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

const SKU = "DRAK-049";

const TITLE = "HSBC Main Building (Hong Kong) – 3D Printed Model";

const DESCRIPTION =
  "This 3D-printed model of the HSBC Main Building, Hong Kong (Foster + Partners, 1985) captures the exposed structural exoskeleton that makes this one of the most important buildings of late 20th-century architecture. At 178 metres in real life, the entire tower hangs from external steel masts — no internal columns, no curtain wall, just structural honesty.\n\n" +
  "A rare model — most makers skip this building because the trusses are difficult to print cleanly. We’ve sorted that.";

const TAGS = [
  "hsbc building",
  "hsbc hong kong",
  "norman foster",
  "foster architecture",
  "exoskeleton building",
  "high tech building",
  "hong kong landmark",
  "hong kong gift",
  "hong kong skyline",
  "architecture gift",
  "gift for architect",
  "landmark miniature",
  "famous building",
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
