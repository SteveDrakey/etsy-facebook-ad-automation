/**
 * Safe Etsy inventory price updater.
 *
 * - Always fetches current inventory first
 * - Always saves a backup before changing anything
 * - Sends back ALL products (full replace — Etsy deletes missing ones)
 * - Dry-run by default — pass dryRun=false to actually push
 * - Shows a diff of what will change
 */
import "dotenv/config";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getAccessToken } from "./auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(__dirname, "../../data/backups");

const API_KEY = `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`;
const BASE = "https://api.etsy.com/v3/application";

export interface PriceChange {
  /** Scale value to match, e.g. "1:1000" (partial match on the scale string) */
  scaleMatch: string;
  /** New price in GBP (e.g. 38.00) */
  newPrice: number;
  /** Optional: only change this colour. Omit to change all colours at this scale. */
  colourMatch?: string;
}

export interface UpdateResult {
  listingId: number;
  title: string;
  backupPath: string;
  changes: Array<{ scale: string; colour: string; oldPrice: number; newPrice: number }>;
  skipped: number;
  success: boolean;
  error?: string;
}

/**
 * Safely update prices on an Etsy listing.
 *
 * @param listingId  Etsy listing ID
 * @param changes    Array of price changes to apply
 * @param dryRun     If true (default), only shows what would change. Set false to push.
 */
export async function updateListingPrices(
  listingId: number,
  changes: PriceChange[],
  dryRun = true
): Promise<UpdateResult> {
  // 1. Fetch current inventory (authenticated, auto-refreshes token)
  const token = await getAccessToken();
  const invRes = await fetch(`${BASE}/listings/${listingId}/inventory`, {
    headers: { "x-api-key": API_KEY, Authorization: `Bearer ${token}` },
  });
  if (!invRes.ok) {
    const body = await invRes.text();
    throw new Error(`Failed to fetch inventory for ${listingId}: ${invRes.status} ${body}`);
  }
  const inv = (await invRes.json()) as any;

  // Fetch listing title
  const listingRes = await fetch(`${BASE}/listings/${listingId}`, {
    headers: { "x-api-key": API_KEY },
  });
  const listing = (await listingRes.json()) as any;
  const title = listing.title || `Listing ${listingId}`;

  // 2. Save backup
  await mkdir(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(BACKUP_DIR, `${listingId}-${timestamp}.json`);
  await writeFile(backupPath, JSON.stringify(inv, null, 2));

  // 3. Build update payload from current inventory (full copy)
  const products = inv.products.map((p: any) => ({
    sku: p.sku || "",
    property_values: p.property_values.map((pv: any) => ({
      property_id: pv.property_id,
      value_ids: pv.value_ids,
      scale_id: pv.scale_id || null,
      property_name: pv.property_name,
      values: pv.values,
    })),
    offerings: p.offerings.map((o: any) => ({
      price: o.price.amount / o.price.divisor,
      quantity: o.quantity,
      is_enabled: o.is_enabled,
      readiness_state_id: o.readiness_state_id,
    })),
  }));

  // 4. Apply changes
  const applied: UpdateResult["changes"] = [];
  let skipped = 0;

  for (const product of products) {
    const scaleProp = product.property_values.find(
      (pv: any) => pv.property_name === "Scale" || pv.property_name === "Size"
    );
    const colourProp = product.property_values.find(
      (pv: any) => pv.property_name === "Primary color" || pv.property_name === "Color"
    );

    const scaleVal = scaleProp?.values[0] ?? "";
    const colourVal = colourProp?.values[0] ?? "default";

    for (const change of changes) {
      if (!scaleVal.includes(change.scaleMatch)) continue;
      if (change.colourMatch && !colourVal.toLowerCase().includes(change.colourMatch.toLowerCase())) continue;

      const oldPrice = product.offerings[0].price;
      if (oldPrice === change.newPrice) {
        skipped++;
        continue;
      }

      applied.push({
        scale: scaleVal,
        colour: colourVal,
        oldPrice,
        newPrice: change.newPrice,
      });

      product.offerings[0].price = change.newPrice;
    }
  }

  // 5. Sanity checks
  const totalProducts = products.length;
  const originalProducts = inv.products.length;
  if (totalProducts !== originalProducts) {
    throw new Error(
      `SAFETY: product count mismatch (${totalProducts} vs ${originalProducts}). Aborting.`
    );
  }

  // 6. Show diff
  console.log(`\n${title} (${listingId})`);
  console.log(`Backup: ${backupPath}`);
  console.log(`Products: ${totalProducts} | Changes: ${applied.length} | Skipped (already correct): ${skipped}\n`);

  if (applied.length === 0) {
    console.log("No changes needed.");
    return { listingId, title, backupPath, changes: applied, skipped, success: true };
  }

  for (const c of applied) {
    console.log(`  ${c.scale.padEnd(28)} ${c.colour.padEnd(20)} £${c.oldPrice} → £${c.newPrice}`);
  }

  if (dryRun) {
    console.log("\n🔒 DRY RUN — no changes pushed. Call with dryRun=false to apply.");
    return { listingId, title, backupPath, changes: applied, skipped, success: true };
  }

  // 7. Push update
  console.log("\nPushing to Etsy...");
  const payload = {
    products,
    price_on_property: inv.price_on_property,
    quantity_on_property: inv.quantity_on_property,
    sku_on_property: inv.sku_on_property,
  };

  const updateRes = await fetch(`${BASE}/listings/${listingId}/inventory`, {
    method: "PUT",
    headers: {
      "x-api-key": API_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!updateRes.ok) {
    const body = await updateRes.text();
    const error = `Update failed: ${updateRes.status} ${body}`;
    console.error(`\n❌ ${error}`);
    return { listingId, title, backupPath, changes: applied, skipped, success: false, error };
  }

  // 8. Verify
  const result = (await updateRes.json()) as any;
  console.log("\n✅ Updated! Verifying...");

  const seen = new Set<string>();
  for (const p of result.products.filter((p: any) => !p.is_deleted)) {
    const scale = p.property_values.find((pv: any) => pv.property_name === "Scale" || pv.property_name === "Size")?.values[0] ?? "N/A";
    const price = p.offerings[0].price.amount / p.offerings[0].price.divisor;
    if (!seen.has(scale)) {
      seen.add(scale);
      console.log(`  ${scale.padEnd(28)} £${price}`);
    }
  }

  return { listingId, title, backupPath, changes: applied, skipped, success: true };
}
