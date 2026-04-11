/**
 * Create a draft Etsy listing for Santa Ana Cathedral (Facade) – El Salvador.
 *
 * Facade model with 3 scales (all under 30cm to print in one piece).
 * Prices: price = round(6 + 5.30 × √(weight_g)), wf=3.0
 *
 * Dry-run by default. Use --apply to create on Etsy.
 *
 * Usage: npx tsx src/scripts/create-santa-ana.ts [--apply]
 */
import "dotenv/config";
import { getAccessToken } from "../etsy/auth.js";

const API_KEY = `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`;
const BASE = "https://api.etsy.com/v3/application";
const SHOP_ID = 56796619;

// ─── Pricing (wf=3.0 facade, ~34m real height) ───────────────
const WIDTH_FACTOR = 3.0;
const REF_HEIGHT = 30;
const REF_WEIGHT = 39;
const SCALE_EXP = 2.5;

function estWeight(hCm: number): number {
  return REF_WEIGHT * Math.pow(hCm / REF_HEIGHT, SCALE_EXP) * Math.pow(WIDTH_FACTOR, 2);
}

function calcPrice(hCm: number): number {
  return Math.round(6 + 5.30 * Math.sqrt(estWeight(hCm)));
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

// ─── Scales (facade, not standard tower ratios) ──────────────
// Real height ~34m. Keep all under 30cm for single-piece printing.
// STL proportions: width = 0.799 × height, depth = 0.231 × height
const REAL_HEIGHT_M = 34;
const SCALES = [
  { ratio: 230, label: "1:230 \u2013 15 cm" },
  { ratio: 170, label: "1:170 \u2013 20 cm" },
  { ratio: 135, label: "1:135 \u2013 25 cm" },
];

function calcScale(ratio: number) {
  const heightCm = Math.round((REAL_HEIGHT_M / ratio) * 1000) / 10;
  const weightG = estWeight(heightCm);
  const price = calcPrice(heightCm);
  const tier = tierForWeight(weightG);
  return { heightCm, price, weightG, readinessId: tier.id, readinessLabel: tier.label };
}

const COLOURS = [
  "Light Grey", "Silver", "Grey", "Bronze",
  "Ash Gray", "Blue Gray", "Cyan", "Jade White",
  "Tan", "Black", "Blue", "Transparent Blue",
  "Transparent Ice Blue",
];

const SKU = "DRAK-042";

const TITLE = "Santa Ana Cathedral (Facade) \u2013 El Salvador | 3D Printed Landmark";

const DESCRIPTION =
  "This 3D-printed model captures the striking neo-Gothic facade of the Cathedral of Our Lady Saint Anne in Santa Ana, El Salvador. " +
  "With its twin bell towers, ornate entrance doors and Gothic tracery, it\u2019s one of Central America\u2019s most distinctive cathedrals \u2014 " +
  "and you almost never see it offered as a physical model.\n\n" +
  "Originally built between 1906 and 1959, the real cathedral stands as a rare example of Gothic Revival architecture in El Salvador, " +
  "where most churches follow a Spanish colonial style. " +
  "This model covers the full front elevation including both towers, the rose window and the central Puerta del Perd\u00F3n.\n\n" +
  "A great display piece for anyone with a connection to El Salvador, or for collectors of world landmarks and sacred architecture.";

const TAGS = [
  "santa ana cathedral",
  "el salvador model",
  "neo gothic church",
  "cathedral facade",
  "el salvador gift",
  "el salvador souvenir",
  "central america gift",
  "architecture gift",
  "gift for architect",
  "bookshelf decor",
  "church replica",
  "landmark model",
  "gothic cathedral",
];

// ─── Create listing + inventory ──────────────────────────────

async function main() {
  const apply = process.argv.includes("--apply");
  const token = await getAccessToken();

  const scaleInfo = SCALES.map((s) => {
    const calc = calcScale(s.ratio);
    const widthCm = Math.round(calc.heightCm * 0.799);
    return { ...s, ...calc, widthCm };
  });

  console.log(apply ? "APPLY MODE \u2014 will create on Etsy\n" : "DRY RUN \u2014 no changes will be pushed\n");
  console.log("=".repeat(60));
  console.log(TITLE);
  console.log("=".repeat(60));
  console.log(`SKU: ${SKU} | Width factor: ${WIDTH_FACTOR} | Real height: ~${REAL_HEIGHT_M}m`);
  console.log(`Colours: ${COLOURS.length} | Scales: ${scaleInfo.length} | Products: ${COLOURS.length * scaleInfo.length}\n`);

  console.log("Scale / Height / Width / Price / Weight / Processing:");
  for (const s of scaleInfo) {
    const wStr = s.weightG < 1000 ? `~${Math.round(s.weightG)}g` : `~${(s.weightG / 1000).toFixed(1)}kg`;
    console.log(`  ${s.label.padEnd(20)} ${String(s.widthCm) + "cm wide".padEnd(12)} \u00a3${String(s.price).padEnd(5)} ${wStr.padEnd(8)} ${s.readinessLabel}`);
  }

  console.log(`\nDescription:\n${DESCRIPTION}\n`);
  console.log(`Tags: ${TAGS.join(", ")}\n`);

  if (!apply) {
    console.log("\ud83d\udd12 DRY RUN \u2014 run with --apply to create on Etsy.");
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
    console.error(`\u274c Failed to create listing: ${createRes.status} ${text}`);
    return;
  }

  const listing = (await createRes.json()) as any;
  const listingId = listing.listing_id;
  console.log(`\u2705 Draft created! ID: ${listingId}`);

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
    console.error(`\u274c Failed to set inventory: ${invRes.status} ${text}`);
    console.error(`Listing created but inventory needs manual setup. ID: ${listingId}`);
    return;
  }

  const invResult = (await invRes.json()) as any;
  const activeProducts = invResult.products.filter((p: any) => !p.is_deleted).length;
  console.log(`\u2705 Inventory set! ${activeProducts} products.`);
  console.log(`Draft: https://www.etsy.com/your/shops/Drakey3DPrints/tools/listings/${listingId}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
