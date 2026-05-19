/**
 * Create a new shop section "Retro Design Icons" and a draft Etsy listing
 * for the Braun TP1 3D-printed replica.
 *
 * Single size (~18cm tall, 322g actual print weight), single fixed price £25.
 * 13 colour variants. Different processing tier (5-7 days, 322g > 200g).
 *
 * Dry-run by default. Use --apply to create on Etsy.
 *
 * Usage: npx tsx src/scripts/create-tp1.ts [--apply]
 */
import "dotenv/config";
import { getAccessToken } from "../etsy/auth.js";

const API_KEY = `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`;
const BASE = "https://api.etsy.com/v3/application";
const SHOP_ID = 56796619;

const NEW_SECTION_TITLE = "Retro Design Icons";

// ─── Listing definition ────────────────────────────────────
const SKU = "DRAK-045";
const PRICE = 25;
const PRINT_WEIGHT_G = 322.75;
const PRINT_TIME = "7h 5m";
const APPROX_HEIGHT_CM = 18;

// 322g → 5-7 days processing tier
const READINESS_ID = 1416213279846;
const READINESS_LABEL = "5-7 days";

const TITLE = "Braun TP1 – 3D Printed Retro Radio Replica | Dieter Rams Design Icon";

const DESCRIPTION =
  "This 3D-printed replica brings home one of the most celebrated objects of 20th-century industrial design — the Braun TP1, designed by Dieter Rams in 1959.\n\n" +
  "The original was a portable combination of the T transistor radio and PCS5 phonograph, and remains a cornerstone of Rams’ minimalist design philosophy. Jony Ive has cited it as a major influence on Apple’s design language — the iPod’s circular dial and perforated grille trace directly back to this piece.\n\n" +
  "Printed at approximately 18cm tall in your choice of 13 colours. A great display piece for design fans, mid-century enthusiasts, or anyone who appreciates the ‘less but better’ aesthetic.";

const TAGS = [
  "braun tp1",
  "dieter rams",
  "mid century",
  "retro radio",
  "design icon",
  "industrial design",
  "design gift",
  "60s design",
  "bauhaus gift",
  "minimalist decor",
  "bookshelf decor",
  "design replica",
  "retro tech",
];

const COLOURS = [
  "Light Grey", "Silver", "Grey", "Bronze",
  "Ash Gray", "Blue Gray", "Cyan", "Jade White",
  "Tan", "Black", "Blue", "Transparent Blue",
  "Transparent Ice Blue",
];

// ─── Find or create the new shop section ───────────────────

async function findOrCreateSection(token: string, apply: boolean): Promise<number | null> {
  const listRes = await fetch(`${BASE}/shops/${SHOP_ID}/sections`, {
    headers: { "x-api-key": API_KEY, Authorization: `Bearer ${token}` },
  });

  if (!listRes.ok) {
    console.error(`❌ Failed to list sections: ${listRes.status} ${await listRes.text()}`);
    return null;
  }

  const data = (await listRes.json()) as any;
  const existing = data.results?.find((s: any) => s.title === NEW_SECTION_TITLE);
  if (existing) {
    console.log(`✅ Section "${NEW_SECTION_TITLE}" already exists. ID: ${existing.shop_section_id}`);
    return existing.shop_section_id;
  }

  console.log(`Section "${NEW_SECTION_TITLE}" does not exist yet.`);

  if (!apply) {
    console.log(`(Dry run — would create new section.)`);
    return null;
  }

  console.log(`Creating new section "${NEW_SECTION_TITLE}"...`);
  const createRes = await fetch(`${BASE}/shops/${SHOP_ID}/sections`, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ title: NEW_SECTION_TITLE }).toString(),
  });

  if (!createRes.ok) {
    console.error(`❌ Failed to create section: ${createRes.status} ${await createRes.text()}`);
    return null;
  }

  const section = (await createRes.json()) as any;
  console.log(`✅ Section created! ID: ${section.shop_section_id}`);
  return section.shop_section_id;
}

// ─── Create listing + inventory ────────────────────────────

async function main() {
  const apply = process.argv.includes("--apply");
  const token = await getAccessToken();

  console.log(apply ? "APPLY MODE — will create on Etsy\n" : "DRY RUN — no changes will be pushed\n");
  console.log("=".repeat(60));
  console.log(TITLE);
  console.log("=".repeat(60));
  console.log(`SKU: ${SKU} | Print weight: ${PRINT_WEIGHT_G}g | Print time: ${PRINT_TIME}`);
  console.log(`Approx height: ${APPROX_HEIGHT_CM}cm | Price: £${PRICE} | Processing: ${READINESS_LABEL}`);
  console.log(`Section: "${NEW_SECTION_TITLE}" (will create if missing)`);
  console.log(`Colours: ${COLOURS.length} | Products: ${COLOURS.length}\n`);

  console.log(`Description:\n${DESCRIPTION}\n`);
  console.log(`Tags: ${TAGS.join(", ")}\n`);

  const sectionId = await findOrCreateSection(token, apply);

  if (!apply) {
    console.log("🔒 DRY RUN — run with --apply to create on Etsy.");
    return;
  }

  if (!sectionId) {
    console.error("❌ Could not determine section ID. Aborting.");
    return;
  }

  // Create draft listing
  console.log("\nCreating draft listing...");

  const body = new URLSearchParams();
  body.append("quantity", "999");
  body.append("title", TITLE);
  body.append("description", DESCRIPTION);
  body.append("price", String(PRICE));
  body.append("who_made", "i_did");
  body.append("when_made", "made_to_order");
  body.append("taxonomy_id", "130");
  body.append("shipping_profile_id", "260719988841");
  body.append("return_policy_id", "1341900298666");
  body.append("shop_section_id", String(sectionId));
  body.append("processing_min", "5");
  body.append("processing_max", "7");
  body.append("type", "physical");
  body.append("is_supply", "false");
  body.append("should_auto_renew", "true");
  body.append("readiness_state_id", String(READINESS_ID));
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
    console.error(`❌ Failed to create listing: ${createRes.status} ${await createRes.text()}`);
    return;
  }

  const listing = (await createRes.json()) as any;
  const listingId = listing.listing_id;
  console.log(`✅ Draft created! ID: ${listingId}`);

  // Inventory: 13 colours, single fixed size
  console.log("Setting up inventory...");

  const products = COLOURS.map((colour) => ({
    sku: SKU,
    property_values: [
      {
        property_id: 200,
        property_name: "Primary color",
        value_ids: [] as number[],
        values: [colour],
        scale_id: null,
      },
    ],
    offerings: [
      {
        price: PRICE,
        quantity: 8,
        is_enabled: true,
        readiness_state_id: READINESS_ID,
      },
    ],
  }));

  const invRes = await fetch(`${BASE}/listings/${listingId}/inventory`, {
    method: "PUT",
    headers: {
      "x-api-key": API_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      products,
      price_on_property: [],
      quantity_on_property: [],
      sku_on_property: [],
      readiness_state_on_property: [],
    }),
  });

  if (!invRes.ok) {
    console.error(`❌ Failed to set inventory: ${invRes.status} ${await invRes.text()}`);
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
