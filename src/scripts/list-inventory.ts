import { config } from "../config.js";
import { getShopId, getActiveListingsFromApi, type EtsyListing } from "../etsy/client.js";

const BASE = config.etsy.baseUrl;

function headers(): Record<string, string> {
  return { "x-api-key": `${config.etsy.apiKey()}:${config.etsy.sharedSecret()}` };
}

interface InventoryProduct {
  product_id: number;
  sku: string;
  is_deleted: boolean;
  offerings: Array<{
    offering_id: number;
    price: { amount: number; divisor: number; currency_code: string };
    quantity: number;
    is_enabled: boolean;
  }>;
  property_values: Array<{
    property_id: number;
    property_name: string;
    values: string[];
  }>;
}

interface InventoryResponse {
  products: InventoryProduct[];
  listing_id: number;
}

async function getListingInventory(listingId: number): Promise<InventoryResponse> {
  const url = `${BASE}/listings/${listingId}/inventory`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Etsy API ${res.status}: ${body}`);
  }
  return res.json() as Promise<InventoryResponse>;
}

function formatPrice(amount: number, divisor: number, currency: string): string {
  const value = amount / divisor;
  const symbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency;
  return `${symbol}${value.toFixed(2)}`;
}

async function main() {
  console.log("Fetching shop ID...");
  const shopId = await getShopId(config.etsy.shopName());
  console.log(`Shop ID: ${shopId}\n`);

  console.log("Fetching active listings...");
  const { listings, total } = await getActiveListingsFromApi(shopId, 100);
  console.log(`Found ${total} active listings\n`);
  console.log("=".repeat(70));

  for (const listing of listings) {
    console.log(`\n${listing.title}`);
    console.log(`  ID: ${listing.listing_id}`);
    console.log(`  Base price: ${formatPrice(listing.price.amount, listing.price.divisor, listing.price.currency_code)}`);
    console.log(`  URL: ${listing.url}`);

    try {
      const inventory = await getListingInventory(listing.listing_id);

      if (inventory.products.length <= 1 && inventory.products[0]?.property_values.length === 0) {
        console.log("  Variations: None");
      } else {
        console.log("  Variations:");
        for (const product of inventory.products) {
          if (product.is_deleted) continue;

          const variantLabel = product.property_values
            .map((pv) => `${pv.property_name}: ${pv.values.join(", ")}`)
            .join(" | ");

          for (const offering of product.offerings) {
            if (!offering.is_enabled) continue;
            const price = formatPrice(offering.price.amount, offering.price.divisor, offering.price.currency_code);
            const qty = offering.quantity;
            console.log(`    ${variantLabel || "Default"} — ${price} (${qty} in stock)`);
          }
        }
      }
    } catch (e: any) {
      console.log(`  Variations: Could not fetch (${e.message})`);
    }

    console.log("-".repeat(70));
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
