/**
 * Analyses pricing consistency by fitting a curve to your actual pricing
 * pattern (price vs estimated weight) and flagging outliers.
 *
 * Small models have a price floor (can't sell for £3 on Etsy).
 * Large models don't scale linearly with material.
 * This finds the best-fit relationship and shows what's out of line.
 *
 * Usage: npx tsx src/scripts/price-consistency.ts
 */
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INVENTORY_PATH = join(__dirname, "../../data/inventory.json");

// ─── Weight model (calibrated: Jeddah 250cm = 5kg) ─────────
const REF_HEIGHT_CM = 30;
const REF_WEIGHT_G = 39;
const SCALING_EXP = 2.5;
const MULTICOLOUR_MULT = 1.5;

function estimateWeightG(heightCm: number, widthFactor: number): number {
  return REF_WEIGHT_G * Math.pow(heightCm / REF_HEIGHT_CM, SCALING_EXP) * Math.pow(widthFactor, 2);
}

// ─── Building profiles ──────────────────────────────────────
interface Profile { widthFactor: number; multiColour: boolean }

const BUILDINGS: Record<string, Profile> = {
  "Burj Khalifa": { widthFactor: 0.8, multiColour: false },
  "Merdeka 118": { widthFactor: 1.0, multiColour: false },
  "Shanghai Tower": { widthFactor: 1.3, multiColour: false },
  "Jeddah Tower": { widthFactor: 0.8, multiColour: false },
  "Lotte World Tower": { widthFactor: 0.9, multiColour: false },
  "One World Trade Center": { widthFactor: 1.1, multiColour: false },
  "Taipei 101": { widthFactor: 1.3, multiColour: false },
  "China Zun (CITIC Tower)": { widthFactor: 1.1, multiColour: false },
  "Goldin Finance 117": { widthFactor: 1.0, multiColour: false },
  "Princess Tower Dubai": { widthFactor: 0.9, multiColour: false },
  "Gevora Hotel": { widthFactor: 0.9, multiColour: false },
  "Q1 Tower": { widthFactor: 0.9, multiColour: false },
  "Jin Mao Tower": { widthFactor: 1.2, multiColour: false },
  "The Shard": { widthFactor: 0.7, multiColour: false },
  "Empire State Building": { widthFactor: 1.5, multiColour: false },
  "Chrysler Building": { widthFactor: 1.3, multiColour: false },
  "Shanghai World Financial Center": { widthFactor: 1.2, multiColour: false },
  "Hancock Tower": { widthFactor: 1.4, multiColour: false },
  "432 Park Avenue": { widthFactor: 0.7, multiColour: true },
  "Oriental Pearl Tower": { widthFactor: 1.8, multiColour: false },
  "Petronas Twin Towers": { widthFactor: 2.5, multiColour: false },
  "Willis Tower": { widthFactor: 2.2, multiColour: true },
  "Ryugyong Hotel": { widthFactor: 2.0, multiColour: false },
  "The Gherkin": { widthFactor: 1.8, multiColour: false },
  "Walkie Talkie Building": { widthFactor: 2.0, multiColour: false },
  "Flatiron Building": { widthFactor: 1.5, multiColour: false },
  "Leadenhall Building": { widthFactor: 1.6, multiColour: true },
  "Merdeka 118 Shiny": { widthFactor: 1.0, multiColour: true },
  "Chrysler Building Colour": { widthFactor: 1.3, multiColour: true },
  "One World Trade Center Colour": { widthFactor: 1.1, multiColour: true },
  "Lotte World Tower Colour": { widthFactor: 0.9, multiColour: true },
  "The Gherkin Colour": { widthFactor: 1.8, multiColour: true },
  "Walkie Talkie Building Colour": { widthFactor: 2.0, multiColour: true },
  "Shanghai World Financial Center Colour": { widthFactor: 1.2, multiColour: true },
  "World Trade Center (Twin Towers)": { widthFactor: 2.5, multiColour: false },
};

// ─── Listing parsing ────────────────────────────────────────
interface Listing {
  listing_id: number; title: string;
  inventory?: { products: Array<{
    is_deleted: boolean;
    offerings: Array<{ price: { amount: number; divisor: number }; is_enabled: boolean }>;
    property_values: Array<{ property_name: string; values: string[] }>;
  }> };
}

function matchBuilding(title: string): string | null {
  const t = title.toLowerCase();
  if (t.includes("shiny") && t.includes("merdeka")) return "Merdeka 118 Shiny";
  if (t.includes("colour") && t.includes("chrysler")) return "Chrysler Building Colour";
  if (t.includes("colour") && t.includes("one world")) return "One World Trade Center Colour";
  if (t.includes("colour") && t.includes("lotte")) return "Lotte World Tower Colour";
  if (t.includes("colour") && t.includes("gherkin")) return "The Gherkin Colour";
  if (t.includes("colour") && t.includes("walkie")) return "Walkie Talkie Building Colour";
  if (t.includes("colour") && t.includes("shanghai world")) return "Shanghai World Financial Center Colour";
  const candidates = Object.keys(BUILDINGS).sort((a, b) => b.length - a.length);
  for (const name of candidates) {
    if (t.includes(name.toLowerCase())) return name;
  }
  return null;
}

function parseScale(val: string): { ratio: number; heightCm: number } | null {
  const m = val.match(/1:(\d+)\s*-\s*([\d.]+)\s*cm/);
  if (!m) return null;
  return { ratio: parseInt(m[1]), heightCm: parseFloat(m[2]) };
}

interface Row {
  building: string; scale: string; ratio: number;
  heightCm: number; weightG: number; currentPrice: number;
  isMultiColour: boolean;
}

async function main() {
  const listings: Listing[] = JSON.parse(await readFile(INVENTORY_PATH, "utf-8"));
  const rows: Row[] = [];

  for (const listing of listings) {
    const name = matchBuilding(listing.title);
    if (!name) continue;
    const profile = BUILDINGS[name];
    if (!profile) continue;
    const products = listing.inventory?.products?.filter((p) => !p.is_deleted) ?? [];
    const seen = new Set<string>();
    for (const p of products) {
      const scaleProp = p.property_values.find(
        (pv) => pv.property_name === "Scale" || pv.property_name === "Size"
      );
      const scaleVal = scaleProp?.values[0] ?? "default";
      if (seen.has(scaleVal)) continue;
      seen.add(scaleVal);
      const parsed = parseScale(scaleVal);
      if (!parsed) continue;
      const offering = p.offerings.find((o) => o.is_enabled);
      if (!offering) continue;
      const price = offering.price.amount / offering.price.divisor;
      const wt = estimateWeightG(parsed.heightCm, profile.widthFactor);
      rows.push({
        building: name, scale: scaleVal, ratio: parsed.ratio,
        heightCm: parsed.heightCm, weightG: wt, currentPrice: price,
        isMultiColour: profile.multiColour,
      });
    }
  }

  // ─── Fit curve: price = floor + rate * weight^power ────────
  // Use mono-colour items only for the base fit.
  // Multi-colour gets a premium on top.
  const mono = rows.filter((r) => !r.isMultiColour);

  // Fit: price = A + B * sqrt(weightG)
  // Using least squares on mono items
  // This captures: small items have a floor, large items scale sub-linearly
  const n = mono.length;
  const xs = mono.map((r) => Math.sqrt(r.weightG));
  const ys = mono.map((r) => r.currentPrice);
  const sumX = xs.reduce((s, x) => s + x, 0);
  const sumY = ys.reduce((s, y) => s + y, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);
  const B = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const A = (sumY - B * sumX) / n;

  console.log("=".repeat(120));
  console.log("PRICING CONSISTENCY ANALYSIS");
  console.log("=".repeat(120));
  console.log(`\nBest-fit curve (mono): price = £${A.toFixed(1)} + £${B.toFixed(2)} × √(weight_g)`);
  console.log("Multi-colour: +50% on the weight-based portion\n");

  // Calculate R² for fit quality
  const meanY = sumY / n;
  const ssRes = mono.reduce((s, r, i) => {
    const predicted = A + B * xs[i];
    return s + Math.pow(r.currentPrice - predicted, 2);
  }, 0);
  const ssTot = ys.reduce((s, y) => s + Math.pow(y - meanY, 2), 0);
  console.log(`Fit quality: R² = ${(1 - ssRes / ssTot).toFixed(3)} (1.0 = perfect)\n`);

  // ─── Show all items with consistent price ──────────────────
  function consistentPrice(weightG: number, isMultiColour: boolean): number {
    const base = A + B * Math.sqrt(weightG);
    const price = isMultiColour ? A + (base - A) * 1.5 : base;
    return Math.round(Math.max(8, price));
  }

  type ResultRow = Row & { consistent: number; diff: number; pctOff: number };
  const results: ResultRow[] = rows.map((r) => {
    const c = consistentPrice(r.weightG, r.isMultiColour);
    return { ...r, consistent: c, diff: r.currentPrice - c, pctOff: ((r.currentPrice - c) / c) * 100 };
  });

  results.sort((a, b) => a.building.localeCompare(b.building) || a.heightCm - b.heightCm);

  const nw = 40, sw = 22;
  console.log(
    "Building".padEnd(nw) + "Scale".padEnd(sw) +
    "Height".padStart(8) + "~Wt(g)".padStart(8) +
    "Now".padStart(7) + "Fitted".padStart(8) +
    "Diff".padStart(7) + " "
  );
  console.log("-".repeat(nw + sw + 8 + 8 + 7 + 8 + 10));

  let curB = "";
  for (const r of results) {
    const label = r.building !== curB ? (r.building + (r.isMultiColour ? " [MC]" : "")).slice(0, nw - 1) : "";
    curB = r.building;

    let flag = "";
    if (r.pctOff > 30) flag = "  ▲ expensive";
    else if (r.pctOff < -30) flag = "  ▼ cheap";
    else if (Math.abs(r.pctOff) <= 15) flag = "  ✓";
    else if (r.pctOff > 0) flag = "  △ bit high";
    else flag = "  ▽ bit low";

    console.log(
      label.padEnd(nw) + r.scale.slice(0, sw - 1).padEnd(sw) +
      `${r.heightCm}`.padStart(8) + `${Math.round(r.weightG)}`.padStart(8) +
      `£${r.currentPrice}`.padStart(7) + `£${r.consistent}`.padStart(8) +
      `${r.diff >= 0 ? "+" : ""}${r.diff}`.padStart(7) + flag
    );
  }

  // ─── Summary: changes needed ──────────────────────────────
  const expensive = results.filter((r) => r.pctOff > 30).sort((a, b) => b.pctOff - a.pctOff);
  const cheap = results.filter((r) => r.pctOff < -30).sort((a, b) => a.pctOff - b.pctOff);
  const ok = results.filter((r) => Math.abs(r.pctOff) <= 30);

  console.log("\n" + "=".repeat(120));
  console.log(`SUMMARY: ${ok.length} of ${results.length} are within 30% of the fitted curve`);
  console.log("=".repeat(120));

  if (expensive.length > 0) {
    console.log(`\n▲ EXPENSIVE relative to pattern (${expensive.length} items — charge more than similar-weight models):`);
    for (const r of expensive) {
      const mc = r.isMultiColour ? " [MC]" : "";
      console.log(
        `  ${(r.building + mc).padEnd(40)} ${r.scale.padEnd(22)} ` +
        `£${r.currentPrice} → £${r.consistent}  (${r.pctOff > 0 ? "+" : ""}${r.pctOff.toFixed(0)}%)`
      );
    }
  }

  if (cheap.length > 0) {
    console.log(`\n▼ CHEAP relative to pattern (${cheap.length} items — charge less than similar-weight models):`);
    for (const r of cheap) {
      const mc = r.isMultiColour ? " [MC]" : "";
      console.log(
        `  ${(r.building + mc).padEnd(40)} ${r.scale.padEnd(22)} ` +
        `£${r.currentPrice} → £${r.consistent}  (${r.pctOff.toFixed(0)}%)`
      );
    }
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
