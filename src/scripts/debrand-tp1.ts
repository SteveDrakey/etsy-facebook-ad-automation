/**
 * De-brand the TP1 listing to reduce trademark/IP risk.
 * Removes "Braun" and "Dieter Rams" from title, description, tags.
 *
 * Usage: npx tsx src/scripts/debrand-tp1.ts [--apply]
 */
import "dotenv/config";
import { getAccessToken } from "../etsy/auth.js";

const API_KEY = `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`;
const BASE = "https://api.etsy.com/v3/application";
const SHOP_ID = 56796619;
const LISTING_ID = 4503821733;

const NEW_TITLE = "1959 Retro Radio Replica – Mid-Century Design Icon | 3D Printed";

const NEW_DESCRIPTION =
  "This 3D-printed replica brings home one of the most celebrated objects of 20th-century industrial design — a 1959 portable radio-phonograph that helped define the minimalist ‘less but better’ aesthetic.\n\n" +
  "The original combined a transistor radio and a record player in one portable unit, and remains a touchstone of modernist design. Its circular dial and perforated speaker grille are widely cited as influences on later iconic product design, including Apple’s iPod.\n\n" +
  "Printed at approximately 18cm tall in your choice of 13 colours. A great display piece for design fans, mid-century enthusiasts, or anyone who appreciates clean industrial form.";

const NEW_TAGS = [
  "retro radio",
  "mid century",
  "design icon",
  "industrial design",
  "design gift",
  "60s design",
  "1959 design",
  "vintage radio",
  "minimalist decor",
  "bookshelf decor",
  "design replica",
  "retro tech",
  "modernist decor",
];

async function main() {
  const apply = process.argv.includes("--apply");
  const token = await getAccessToken();

  console.log(apply ? "APPLY MODE — will update on Etsy\n" : "DRY RUN — no changes will be pushed\n");
  console.log("=".repeat(60));
  console.log("DE-BRANDING TP1 LISTING");
  console.log("=".repeat(60));
  console.log(`Listing ID: ${LISTING_ID}\n`);
  console.log(`New title:\n  ${NEW_TITLE}\n`);
  console.log(`New description:\n${NEW_DESCRIPTION}\n`);
  console.log(`New tags: ${NEW_TAGS.join(", ")}\n`);

  if (!apply) {
    console.log("🔒 DRY RUN — run with --apply to update on Etsy.");
    return;
  }

  console.log("Updating listing...");

  const body = new URLSearchParams();
  body.append("title", NEW_TITLE);
  body.append("description", NEW_DESCRIPTION);
  body.append("tags", NEW_TAGS.join(","));

  const res = await fetch(`${BASE}/shops/${SHOP_ID}/listings/${LISTING_ID}`, {
    method: "PATCH",
    headers: {
      "x-api-key": API_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    console.error(`❌ Failed to update: ${res.status} ${await res.text()}`);
    return;
  }

  console.log(`✅ Listing updated!`);
  console.log(`Draft: https://www.etsy.com/your/shops/Drakey3DPrints/tools/listings/${LISTING_ID}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
