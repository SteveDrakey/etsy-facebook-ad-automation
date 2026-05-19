/**
 * Align Burj Khalifa per-offering readiness_state_id to the weight-based tier
 * table (same one used by create-bt-tower.ts and the rest of the create-* scripts).
 *
 * SAFETY MODEL
 *   - Fetches current inventory, saves a timestamped backup to data/backups/
 *   - Builds the PUT payload as an exact copy of current inventory, then only
 *     overwrites readiness_state_id where the weight tier disagrees
 *   - Asserts product + offering counts match before/after
 *   - Asserts NO price or quantity differs from the source between in-memory
 *     payload and the fetched inventory
 *   - Dry-run by default — pass --apply to push
 *
 * Burj profile (from src/scripts/price-calc.ts:106):
 *   real height 828m, widthFactor 0.8, mono-colour
 *
 * Tier table (from src/scripts/create-bt-tower.ts:33-39):
 *   < 200g   → 1402849608497 (3-5 days)
 *   < 500g   → 1416213279846 (5-7 days)
 *   < 1000g  → 1403752122613 (1 week)
 *   < 3000g  → 1413282949624 (1-2 weeks)
 *   ≥ 3000g  → 1442956055906 (2-3 weeks)
 *
 * Usage:
 *   npx tsx src/scripts/align-burj-readiness.ts             # dry run
 *   npx tsx src/scripts/align-burj-readiness.ts --apply     # push
 */
import "dotenv/config";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getAccessToken } from "../etsy/auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(__dirname, "../../data/backups");

const API_KEY = `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`;
const BASE = "https://api.etsy.com/v3/application";
const LISTING_ID = 1888876448; // Burj Khalifa
const apply = process.argv.includes("--apply");

// ─── Building profile (mirror of price-calc.ts:106) ──────────
const WIDTH_FACTOR = 0.8;
const MULTI_COLOUR = false;

// ─── Weight formula (mirror of price-calc.ts:191-205) ────────
const REF_HEIGHT_CM = 30;
const REF_WEIGHT_G = 39;
const SCALING_EXPONENT = 2.5;
const MULTICOLOUR_MULT = 1.5;

function computeWeightG(heightCm: number): number {
  const colour = MULTI_COLOUR ? MULTICOLOUR_MULT : 1.0;
  return (
    REF_WEIGHT_G *
    Math.pow(heightCm / REF_HEIGHT_CM, SCALING_EXPONENT) *
    Math.pow(WIDTH_FACTOR, 2) *
    colour
  );
}

// ─── Tier table — recalibrated faster than the original
//     create-bt-tower.ts thresholds because actual print throughput is higher
//     than the formula assumed. Each tier roughly doubles the previous cap.
interface Tier {
  maxWeight: number;
  id: number;
  label: string;
}
const TIERS: Tier[] = [
  { maxWeight: 400, id: 1402849608497, label: "3-5 days" },
  { maxWeight: 1000, id: 1416213279846, label: "5-7 days" },
  { maxWeight: 2500, id: 1403752122613, label: "1 week" },
  { maxWeight: 5000, id: 1413282949624, label: "1-2 weeks" },
  { maxWeight: Infinity, id: 1442956055906, label: "2-3 weeks" },
];

function tierForWeight(weightG: number): Tier {
  return TIERS.find((t) => weightG < t.maxWeight) || TIERS[TIERS.length - 1];
}

function parseScaleHeightCm(scaleVal: string): number | null {
  // Format: "1:3000 - 27.6 cm" or "1:600 – 138 cm"
  const m = scaleVal.match(/1:\d+\s*[-–—]\s*([\d.]+)\s*cm/);
  return m ? parseFloat(m[1]) : null;
}

interface Offering {
  offering_id: number;
  quantity: number;
  is_enabled: boolean;
  is_deleted?: boolean;
  price: { amount: number; divisor: number; currency_code: string };
  readiness_state_id: number;
}
interface PropertyValue {
  property_id: number;
  property_name: string;
  scale_id?: number | null;
  value_ids: number[];
  values: string[];
}
interface Product {
  product_id: number;
  is_deleted: boolean;
  sku?: string;
  offerings: Offering[];
  property_values: PropertyValue[];
}
interface Inventory {
  products: Product[];
  price_on_property: number[];
  quantity_on_property: number[];
  sku_on_property: number[];
  readiness_state_on_property: number[];
}

async function main() {
  console.log(apply ? "APPLY" : "DRY RUN");
  console.log(`Listing: ${LISTING_ID} (Burj Khalifa)\n`);

  const token = await getAccessToken();

  // 1. Fetch current inventory
  const invRes = await fetch(`${BASE}/listings/${LISTING_ID}/inventory`, {
    headers: { "x-api-key": API_KEY, Authorization: `Bearer ${token}` },
  });
  if (!invRes.ok) {
    throw new Error(`Fetch inventory failed: ${invRes.status} ${await invRes.text()}`);
  }
  const inv = (await invRes.json()) as Inventory;
  console.log(`Fetched inventory: ${inv.products.length} products`);

  // 2. Back up
  await mkdir(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(BACKUP_DIR, `${LISTING_ID}-readiness-${ts}.json`);
  await writeFile(backupPath, JSON.stringify(inv, null, 2));
  console.log(`Backup:  ${backupPath}\n`);

  // 3. Build payload = exact copy, then only adjust readiness_state_id
  // Preserve: property_values, prices, quantities, is_enabled, is_deleted, sku
  type PayloadOffering = {
    price: number;
    quantity: number;
    is_enabled: boolean;
    readiness_state_id: number;
  };
  type PayloadProduct = {
    sku: string;
    property_values: Array<{
      property_id: number;
      value_ids: number[];
      scale_id: number | null;
      property_name: string;
      values: string[];
    }>;
    offerings: PayloadOffering[];
  };

  const payloadProducts: PayloadProduct[] = inv.products.map((p) => ({
    sku: p.sku || "",
    property_values: p.property_values.map((pv) => ({
      property_id: pv.property_id,
      value_ids: pv.value_ids,
      scale_id: pv.scale_id ?? null,
      property_name: pv.property_name,
      values: pv.values,
    })),
    offerings: p.offerings.map((o) => ({
      price: o.price.amount / o.price.divisor,
      quantity: o.quantity,
      is_enabled: o.is_enabled,
      readiness_state_id: o.readiness_state_id, // copied, possibly overwritten below
    })),
  }));

  // 4. Compute target readiness per scale + apply to payload
  interface DiffRow {
    scale: string;
    heightCm: number;
    weightG: number;
    currentId: number;
    targetId: number;
    targetLabel: string;
    count: number;
  }
  const byScale = new Map<string, DiffRow>();
  let changedOfferings = 0;
  let unchangedOfferings = 0;
  let unparseable = 0;

  for (let pi = 0; pi < inv.products.length; pi++) {
    const original = inv.products[pi];
    const out = payloadProducts[pi];

    const scaleProp = original.property_values.find(
      (pv) => pv.property_name === "Scale"
    );
    const scaleVal = scaleProp?.values[0];
    if (!scaleVal) {
      unparseable += original.offerings.length;
      continue;
    }
    const heightCm = parseScaleHeightCm(scaleVal);
    if (heightCm === null) {
      unparseable += original.offerings.length;
      continue;
    }

    const weightG = computeWeightG(heightCm);
    const tier = tierForWeight(weightG);

    for (let oi = 0; oi < original.offerings.length; oi++) {
      const currentId = original.offerings[oi].readiness_state_id;
      if (currentId !== tier.id) {
        out.offerings[oi].readiness_state_id = tier.id;
        changedOfferings++;
      } else {
        unchangedOfferings++;
      }

      const key = scaleVal;
      if (!byScale.has(key)) {
        byScale.set(key, {
          scale: scaleVal,
          heightCm,
          weightG,
          currentId,
          targetId: tier.id,
          targetLabel: tier.label,
          count: 0,
        });
      }
      byScale.get(key)!.count++;
    }
  }

  // 5. Sanity checks
  if (payloadProducts.length !== inv.products.length) {
    throw new Error(
      `SAFETY: product count mismatch ${payloadProducts.length} vs ${inv.products.length}`
    );
  }
  for (let pi = 0; pi < inv.products.length; pi++) {
    const a = inv.products[pi];
    const b = payloadProducts[pi];
    if (a.offerings.length !== b.offerings.length) {
      throw new Error(`SAFETY: offering count mismatch at product ${pi}`);
    }
    for (let oi = 0; oi < a.offerings.length; oi++) {
      const origPrice = a.offerings[oi].price.amount / a.offerings[oi].price.divisor;
      if (origPrice !== b.offerings[oi].price) {
        throw new Error(
          `SAFETY: price changed at product ${pi} offering ${oi}: ${origPrice} vs ${b.offerings[oi].price}`
        );
      }
      if (a.offerings[oi].quantity !== b.offerings[oi].quantity) {
        throw new Error(`SAFETY: quantity changed at product ${pi} offering ${oi}`);
      }
      if (a.offerings[oi].is_enabled !== b.offerings[oi].is_enabled) {
        throw new Error(`SAFETY: is_enabled changed at product ${pi} offering ${oi}`);
      }
    }
  }

  // 6. Print diff
  console.log("Per-scale plan:");
  const scales = [...byScale.values()].sort((a, b) => a.heightCm - b.heightCm);
  for (const s of scales) {
    const flag = s.currentId === s.targetId ? " " : "→";
    console.log(
      `  ${flag} ${s.scale.padEnd(22)} ` +
        `${Math.round(s.weightG)}g  ` +
        `${s.currentId} → ${s.targetId} (${s.targetLabel})  ` +
        `[${s.count} offerings]`
    );
  }

  console.log(`\nOfferings to change: ${changedOfferings}`);
  console.log(`Offerings unchanged: ${unchangedOfferings}`);
  if (unparseable > 0) console.log(`Offerings skipped (no Scale): ${unparseable}`);

  if (changedOfferings === 0) {
    console.log("\nNothing to do.");
    return;
  }

  if (!apply) {
    console.log("\n🔒 DRY RUN — no changes pushed. Use --apply to push.");
    return;
  }

  // 7. Push
  console.log("\nPushing inventory update…");
  const payload = {
    products: payloadProducts,
    price_on_property: inv.price_on_property,
    quantity_on_property: inv.quantity_on_property,
    sku_on_property: inv.sku_on_property,
    readiness_state_on_property: inv.readiness_state_on_property,
  };

  const updRes = await fetch(`${BASE}/listings/${LISTING_ID}/inventory`, {
    method: "PUT",
    headers: {
      "x-api-key": API_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!updRes.ok) {
    console.error(`❌ PUT failed: ${updRes.status} ${await updRes.text()}`);
    console.error(`   Backup at ${backupPath}`);
    process.exit(1);
  }

  const result = (await updRes.json()) as { products: Product[] };
  console.log(`✅ PUT OK. Server returned ${result.products.length} products.`);

  // 8. Verify
  const fresh = await fetch(`${BASE}/listings/${LISTING_ID}/inventory`, {
    headers: { "x-api-key": API_KEY, Authorization: `Bearer ${token}` },
  }).then((r) => r.json() as Promise<Inventory>);

  const live = new Map<string, Set<number>>();
  for (const p of fresh.products) {
    const s = p.property_values.find((pv) => pv.property_name === "Scale")?.values[0];
    if (!s) continue;
    if (!live.has(s)) live.set(s, new Set());
    for (const o of p.offerings) live.get(s)!.add(o.readiness_state_id);
  }
  console.log("\nVerify (per scale, distinct readiness states now live):");
  for (const s of scales) {
    const ids = live.get(s.scale) ? [...live.get(s.scale)!].join(",") : "?";
    const ok = ids === String(s.targetId) ? "✓" : "⚠";
    console.log(`  ${ok} ${s.scale.padEnd(22)} target ${s.targetId}  live ${ids}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
