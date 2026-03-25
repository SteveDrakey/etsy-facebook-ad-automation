/**
 * Fetches all active listings with full inventory (variations + prices)
 * and saves to data/inventory.json
 *
 * Usage: npx tsx src/scripts/dump-inventory.ts
 */
import { config } from "../config.js";
import { getShopId, getActiveListingsFromApi } from "../etsy/client.js";
import { writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "../../data/inventory.json");

const BASE = config.etsy.baseUrl;
const API_KEY = `${config.etsy.apiKey()}:${config.etsy.sharedSecret()}`;

interface InventoryOffering {
  price: { amount: number; divisor: number; currency_code: string };
  quantity: number;
  is_enabled: boolean;
}

interface InventoryProduct {
  product_id: number;
  is_deleted: boolean;
  offerings: InventoryOffering[];
  property_values: Array<{
    property_id: number;
    property_name: string;
    values: string[];
  }>;
}

interface ListingWithInventory {
  listing_id: number;
  title: string;
  description: string;
  url: string;
  tags: string[];
  price: { amount: number; divisor: number; currency_code: string };
  has_variations: boolean;
  inventory?: { products: InventoryProduct[] };
}

async function fetchListingWithInventory(listingId: number): Promise<ListingWithInventory> {
  const url = `${BASE}/listings/${listingId}?includes=Inventory`;
  const res = await fetch(url, { headers: { "x-api-key": API_KEY } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Etsy API ${res.status} for ${listingId}: ${body}`);
  }
  return res.json() as Promise<ListingWithInventory>;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Fetching shop ID...");
  const shopId = await getShopId(config.etsy.shopName());

  console.log("Fetching active listings...");
  const { listings, total } = await getActiveListingsFromApi(shopId, 100);
  console.log(`Found ${total} listings, fetching inventory for each...\n`);

  const results: ListingWithInventory[] = [];
  for (let i = 0; i < listings.length; i++) {
    const l = listings[i];
    process.stdout.write(`  [${i + 1}/${listings.length}] ${l.title.slice(0, 50)}...`);
    try {
      const full = await fetchListingWithInventory(l.listing_id);
      results.push(full);
      const varCount = full.inventory?.products?.length ?? 0;
      console.log(` ${varCount} variants`);
    } catch (e: any) {
      console.log(` ERROR: ${e.message}`);
    }
    // Rate limit: 5 QPS
    if (i < listings.length - 1) await sleep(220);
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2) + "\n");
  console.log(`\nSaved ${results.length} listings to data/inventory.json`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
