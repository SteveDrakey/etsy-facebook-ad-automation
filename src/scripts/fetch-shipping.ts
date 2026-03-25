/**
 * Fetches shipping profile details for all unique profiles used by listings.
 * Saves to data/shipping-profiles.json
 *
 * Usage: npx tsx src/scripts/fetch-shipping.ts
 */
import { config } from "../config.js";
import { readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INVENTORY_PATH = join(__dirname, "../../data/inventory.json");
const OUTPUT_PATH = join(__dirname, "../../data/shipping-profiles.json");

const BASE = config.etsy.baseUrl;
const API_KEY = `${config.etsy.apiKey()}:${config.etsy.sharedSecret()}`;

async function main() {
  const listings = JSON.parse(await readFile(INVENTORY_PATH, "utf-8"));

  // Get unique shipping profile IDs and a sample listing for each
  const profileListings = new Map<number, { listingId: number; title: string }>();
  for (const l of listings) {
    const pid = l.shipping_profile_id;
    if (!profileListings.has(pid)) {
      profileListings.set(pid, { listingId: l.listing_id, title: l.title });
    }
  }

  console.log(`Found ${profileListings.size} unique shipping profiles\n`);

  const profiles: any[] = [];
  for (const [pid, { listingId, title }] of profileListings) {
    console.log(`Profile ${pid} (via: ${title.slice(0, 50)})`);
    const url = `${BASE}/listings/${listingId}?includes=Shipping`;
    const res = await fetch(url, { headers: { "x-api-key": API_KEY } });
    if (!res.ok) {
      console.log(`  ERROR: ${res.status}`);
      continue;
    }
    const data = await res.json() as any;
    const sp = data.shipping_profile;
    if (!sp) {
      console.log("  No shipping profile returned");
      continue;
    }

    // Count how many listings use this profile
    const count = listings.filter((l: any) => l.shipping_profile_id === pid).length;

    profiles.push({ ...sp, listing_count: count });

    for (const dest of sp.shipping_profile_destinations || []) {
      const to = dest.destination_country_iso || "Everywhere else";
      const primary = dest.primary_cost.amount / dest.primary_cost.divisor;
      const secondary = dest.secondary_cost.amount / dest.secondary_cost.divisor;
      console.log(`  To: ${to.padEnd(15)} Primary: £${primary}  Additional: £${secondary}  Class: ${dest.mail_class}`);
    }
    console.log();

    await new Promise((r) => setTimeout(r, 220));
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(profiles, null, 2) + "\n");
  console.log(`Saved ${profiles.length} profiles to data/shipping-profiles.json`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
