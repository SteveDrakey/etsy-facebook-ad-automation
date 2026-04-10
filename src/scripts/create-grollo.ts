/**
 * Create two draft Etsy listings for the Grollo Tower:
 *   1. 1997 design (678m)
 *   2. 2001 design (560m)
 *
 * Prices calculated using the grid.ts formula.
 * Same colours as other mono-colour towers. Draft state (no photos yet).
 *
 * Dry-run by default. Use --apply to create on Etsy.
 *
 * Usage: npx tsx src/scripts/create-grollo.ts [--apply]
 */
import "dotenv/config";
import { getAccessToken } from "../etsy/auth.js";

const API_KEY = `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`;
const BASE = "https://api.etsy.com/v3/application";
const SHOP_ID = 56796619;

// ─── Pricing formula (from grid.ts) ────────────────────────
const WIDTH_FACTOR = 0.9; // slim tower
const REF_HEIGHT = 30;
const REF_WEIGHT = 39;
const SCALE_EXP = 2.5;
const PLA_KG = 20;

function estWeight(hCm: number): number {
  return REF_WEIGHT * Math.pow(hCm / REF_HEIGHT, SCALE_EXP) * Math.pow(WIDTH_FACTOR, 2);
}

function suggestedPrice(weightG: number, heightCm: number): number {
  const matCost = (weightG / 1000) * PLA_KG;
  let price: number;
  if (matCost < 1) {
    price = Math.max(8, 5 + heightCm * 0.8);
  } else if (matCost < 5) {
    price = 20 + matCost * 4;
  } else if (matCost < 20) {
    price = 30 + matCost * 3;
  } else if (matCost < 50) {
    price = 50 + matCost * 2;
  } else if (matCost < 100) {
    price = 80 + matCost * 1.5;
  } else {
    price = 100 + matCost * 1.3;
  }
  return Math.round(price);
}

// ─── Processing time tiers (from assign-processing.ts) ────
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

function calcScale(realHeightM: number, ratio: number) {
  const heightCm = (realHeightM / ratio) * 100;
  const weightG = estWeight(heightCm);
  const price = suggestedPrice(weightG, heightCm);
  const tier = tierForWeight(weightG);
  return { price, weightG, readinessId: tier.id, readinessLabel: tier.label };
}

const SCALE_RATIOS = [3000, 2000, 1200, 1000, 800, 600, 400];

const COLOURS = [
  "Light Grey", "Silver", "Grey", "Bronze",
  "Ash Gray", "Blue Gray", "Cyan", "Jade White",
  "Tan", "Black", "Blue", "Transparent Blue",
  "Transparent Ice Blue",
];

const MATERIALS = ["Plastic", "Printed"];

// ─── Two listings ──────────────────────────────────────────

interface ListingDef {
  sku: string;
  realHeightM: number;
  title: string;
  description: string;
  tags: string[];
}

const LISTINGS: ListingDef[] = [
  {
    sku: "DRAK-040",
    realHeightM: 678,
    title: "Grollo Tower (1997) \u2013 3D Printed Skyscraper Model",
    description:
      "This 3D-printed model of the original 1997 Grollo Tower proposal captures the ambitious 678m design that would have made it the tallest building in the world at the time.\n\n" +
      "Proposed for Melbourne\u2019s Docklands by the Grollo family, this unbuilt supertall would have towered over the Southern Hemisphere. " +
      "Whether you\u2019re a fan of visionary architecture or building your own miniature skyline, this model brings a bold piece of Melbourne\u2019s architectural history to life.",
    tags: [
      "grollo tower model",
      "grollo tower 1997",
      "melbourne tower",
      "melbourne landmark",
      "melbourne gift",
      "melbourne souvenir",
      "australia gift",
      "architecture gift",
      "gift for architect",
      "bookshelf decor",
      "tower replica",
      "skyscraper model",
      "unbuilt skyscraper",
    ],
  },
  {
    sku: "DRAK-041",
    realHeightM: 560,
    title: "Grollo Tower (2001) \u2013 3D Printed Skyscraper Model",
    description:
      "This 3D-printed model of the revised 2001 Grollo Tower proposal captures the 560m Denton Corker Marshall design planned for Melbourne\u2019s Docklands.\n\n" +
      "A scaled-back but still striking vision, this version would have been the tallest building in the Southern Hemisphere. " +
      "Whether you\u2019re a fan of visionary architecture or building your own miniature skyline, this model brings an ambitious unbuilt design to life.",
    tags: [
      "grollo tower model",
      "grollo tower 2001",
      "melbourne tower",
      "melbourne landmark",
      "melbourne gift",
      "melbourne souvenir",
      "australia gift",
      "architecture gift",
      "gift for architect",
      "bookshelf decor",
      "tower replica",
      "skyscraper model",
      "unbuilt skyscraper",
    ],
  },
];

// ─── Create a single listing + inventory ───────────────────

async function createListing(def: ListingDef, token: string, apply: boolean) {
  const scaleInfo = SCALE_RATIOS.map((ratio) => {
    const heightCm = Math.round((def.realHeightM / ratio) * 1000) / 10;
    const calc = calcScale(def.realHeightM, ratio);
    const label = `1:${ratio} - ${heightCm} cm`;
    return { ratio, heightCm, label, ...calc };
  });

  console.log(`\n${"=".repeat(60)}`);
  console.log(`${def.title}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Height: ${def.realHeightM}m | SKU: ${def.sku}`);
  console.log(`Colours: ${COLOURS.length} | Scales: ${scaleInfo.length} | Products: ${COLOURS.length * scaleInfo.length}\n`);

  console.log("Scale / Model Height / Price / Processing:");
  for (const s of scaleInfo) {
    const wStr = s.weightG < 1000 ? `~${Math.round(s.weightG)}g` : `~${(s.weightG / 1000).toFixed(1)}kg`;
    console.log(`  ${s.label.padEnd(25)} \u00a3${String(s.price).padEnd(5)} ${wStr.padEnd(8)} ${s.readinessLabel}`);
  }
  console.log(`\nTags: ${def.tags.join(", ")}`);

  if (!apply) return;

  // Step 1: Create draft listing
  console.log("\nCreating draft listing...");

  const basePrice = scaleInfo[0].price;
  const body = new URLSearchParams();
  body.append("quantity", "999");
  body.append("title", def.title);
  body.append("description", def.description);
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
  body.append("tags", def.tags.join(","));
  body.append("materials", MATERIALS.join(","));

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
        sku: def.sku,
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

// ─── Main ──────────────────────────────────────────────────

async function main() {
  const apply = process.argv.includes("--apply");
  const token = await getAccessToken();

  console.log(apply
    ? "APPLY MODE \u2014 will create on Etsy\n"
    : "DRY RUN \u2014 no changes will be pushed\n"
  );

  for (const def of LISTINGS) {
    await createListing(def, token, apply);
  }

  if (!apply) {
    console.log("\n\ud83d\udd12 DRY RUN \u2014 run with --apply to create on Etsy.");
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
