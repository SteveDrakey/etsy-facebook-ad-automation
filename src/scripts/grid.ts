/**
 * Pricing grid + recommendations for mono-colour single towers.
 * Shows current prices, cost calc, and what they should be for consistency.
 * Saves recommendations to data/price-recommendations.json
 *
 * Excludes: multi-colour, bundles, cityscapes, stadiums, landmarks, spare parts.
 * Only considers ENABLED offerings.
 *
 * Usage: npx tsx src/scripts/grid.ts
 */
import "dotenv/config";
import { readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INVENTORY_PATH = join(__dirname, "../../data/inventory.json");
const OUTPUT_PATH = join(__dirname, "../../data/price-recommendations.json");

// ─── Weight model (calibrated: Jeddah 250cm = 5kg) ─────────
const REF_HEIGHT = 30;
const REF_WEIGHT = 39;
const SCALE_EXP = 2.5;
const PLA_KG = 20;

function estWeight(hCm: number, wFactor: number): number {
  return REF_WEIGHT * Math.pow(hCm / REF_HEIGHT, SCALE_EXP) * Math.pow(wFactor, 2);
}

// ─── Building profiles (mono only) ─────────────────────────
interface Profile { realHeightM: number; widthFactor: number }

const BUILDINGS: Record<string, Profile> = {
  "Burj Khalifa": { realHeightM: 828, widthFactor: 0.8 },
  "Merdeka 118": { realHeightM: 679, widthFactor: 1.0 },
  "Shanghai Tower": { realHeightM: 632, widthFactor: 1.3 },
  "Jeddah Tower": { realHeightM: 1000, widthFactor: 0.8 },
  "Lotte World Tower": { realHeightM: 555, widthFactor: 0.9 },
  "One World Trade Center": { realHeightM: 541, widthFactor: 1.1 },
  "Taipei 101": { realHeightM: 508, widthFactor: 1.3 },
  "China Zun": { realHeightM: 528, widthFactor: 1.1 },
  "Goldin Finance 117": { realHeightM: 597, widthFactor: 1.0 },
  "Princess Tower": { realHeightM: 414, widthFactor: 0.9 },
  "Gevora Hotel": { realHeightM: 356, widthFactor: 0.9 },
  "Q1 Tower": { realHeightM: 323, widthFactor: 0.9 },
  "Jin Mao Tower": { realHeightM: 421, widthFactor: 1.2 },
  "The Shard": { realHeightM: 310, widthFactor: 0.7 },
  "Empire State": { realHeightM: 443, widthFactor: 1.5 },
  "Chrysler Building": { realHeightM: 319, widthFactor: 1.3 },
  "Shanghai World Financial Center": { realHeightM: 492, widthFactor: 1.2 },
  "Hancock Tower": { realHeightM: 457, widthFactor: 1.4 },
  "Oriental Pearl Tower": { realHeightM: 468, widthFactor: 1.8 },
  "Petronas Twin Towers": { realHeightM: 452, widthFactor: 2.5 },
  "Ryugyong Hotel": { realHeightM: 330, widthFactor: 2.0 },
  "The Gherkin": { realHeightM: 180, widthFactor: 1.8 },
  "Walkie Talkie": { realHeightM: 160, widthFactor: 2.0 },
  "Flatiron Building": { realHeightM: 87, widthFactor: 1.5 },
  "World Trade Center Twins": { realHeightM: 417, widthFactor: 2.5 },
};

// Skip these (multi-colour, bundles, cities, etc.)
const SKIP = [
  "Festive", "Times Square", "San Francisco", "Spare Parts",
  "London Skyline", "Shanghai Skyline", "Wrigley", "Canary Wharf",
  "Miniature Shanghai", "Basilica", "Lotus Temple",
  "colour", "Colour", "Shiny", "Multi-Colour", "multi colour",
  "Willis Tower", "432 Park", "Leadenhall",
  "Walkie Talkie Building in multi",
  "Gherkin in colour",
];

function matchProfile(title: string): { name: string; profile: Profile } | null {
  const t = title.toLowerCase();
  // Skip MC and special listings
  if (SKIP.some((s) => title.includes(s))) return null;

  const keys = Object.keys(BUILDINGS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (t.includes(key.toLowerCase())) return { name: key, profile: BUILDINGS[key] };
  }
  if (t.includes("twin tower") || (t.includes("world trade") && t.includes("pair"))) return { name: "World Trade Center Twins", profile: BUILDINGS["World Trade Center Twins"] };
  if (t.includes("gherkin")) return { name: "The Gherkin", profile: BUILDINGS["The Gherkin"] };
  if (t.includes("walkie talkie")) return { name: "Walkie Talkie", profile: BUILDINGS["Walkie Talkie"] };
  if (t.includes("china zun") || t.includes("citic")) return { name: "China Zun", profile: BUILDINGS["China Zun"] };
  if (t.includes("oriental pearl")) return { name: "Oriental Pearl Tower", profile: BUILDINGS["Oriental Pearl Tower"] };
  if (t.includes("petronas")) return { name: "Petronas Twin Towers", profile: BUILDINGS["Petronas Twin Towers"] };
  if (t.includes("ryugyong")) return { name: "Ryugyong Hotel", profile: BUILDINGS["Ryugyong Hotel"] };
  return null;
}

// ─── Consistent pricing formula ─────────────────────────────
// Fitted from current pricing: price = A + B * sqrt(weight)
// But we also want consistency, so we'll use a single formula for ALL buildings
// and show where current prices deviate.
//
// Approach: price tiers by estimated weight, with a minimum floor.
// Competitor median is ~£39 for a single model (no size info though).

function suggestedPrice(weightG: number, heightCm: number): number {
  // Material cost
  const matCost = (weightG / 1000) * PLA_KG;

  // Pricing formula: covers material + time + packaging + margin
  // Small models (<50g): floor price driven by minimum viability
  // Medium (50-500g): moderate markup
  // Large (500g+): lower markup % but higher absolute profit

  let price: number;
  if (matCost < 1) {
    // Tiny model, material is negligible. Price by perceived value.
    // Minimum £8 (like Flatiron), typical £20 for a decent sized small model
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

// ─── Main ───────────────────────────────────────────────────

interface ScaleEntry {
  ratio: number;
  heightCm: number;
  currentPrice: number;
  weightG: number;
  matCost: number;
  suggested: number;
}

interface ListingRow {
  listingId: number;
  name: string;
  widthFactor: number;
  scales: ScaleEntry[];
}

async function main() {
  const inv = JSON.parse(await readFile(INVENTORY_PATH, "utf-8"));
  const rows: ListingRow[] = [];

  for (const l of inv) {
    const match = matchProfile(l.title);
    if (!match) continue;

    const products = l.inventory?.products?.filter((p: any) => !p.is_deleted) ?? [];
    const scales: ScaleEntry[] = [];
    const seen = new Set<number>();

    for (const p of products) {
      const o = p.offerings[0];
      if (!o.is_enabled) continue;

      const sp = p.property_values.find((pv: any) => pv.property_name === "Scale" || pv.property_name === "Size");
      if (!sp) continue;
      const m = sp.values[0].match(/1:(\d+)\s*[-–—]\s*([\d.]+)\s*cm/);
      if (!m) continue;

      const ratio = parseInt(m[1]);
      if (seen.has(ratio)) continue;
      seen.add(ratio);

      const heightCm = parseFloat(m[2]);
      const price = o.price.amount / o.price.divisor;
      const wt = estWeight(heightCm, match.profile.widthFactor);
      const mat = (wt / 1000) * PLA_KG;
      const sug = suggestedPrice(wt, heightCm);

      scales.push({ ratio, heightCm, currentPrice: price, weightG: wt, matCost: mat, suggested: sug });
    }

    scales.sort((a, b) => b.ratio - a.ratio);
    if (scales.length > 0) {
      rows.push({ listingId: l.listing_id, name: match.name, widthFactor: match.profile.widthFactor, scales });
    }
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));

  // ─── Print grid ──────────────────────────────────────
  const allRatios = [...new Set(rows.flatMap((r) => r.scales.map((s) => s.ratio)))].sort((a, b) => b - a);
  // Remove 1:500 oddity flag
  const has500 = rows.some((r) => r.scales.some((s) => s.ratio === 500));

  const nw = 30;
  const cw = 9;

  console.log("=".repeat(120));
  console.log("MONO-COLOUR TOWER PRICING GRID (enabled offerings only)");
  console.log("=".repeat(120));

  // Current prices
  let header = "Building".padEnd(nw) + "W".padStart(4);
  for (const r of allRatios) header += `1:${r}`.padStart(cw);
  console.log("\nCURRENT PRICES:");
  console.log(header);
  console.log("-".repeat(header.length));

  for (const row of rows) {
    let line = row.name.slice(0, nw - 1).padEnd(nw) + row.widthFactor.toFixed(1).padStart(4);
    for (const r of allRatios) {
      const s = row.scales.find((s) => s.ratio === r);
      line += (s ? `£${s.currentPrice}` : ".").padStart(cw);
    }
    console.log(line);
  }

  // Suggested prices
  console.log("\nSUGGESTED PRICES (based on weight model + material cost):");
  console.log(header);
  console.log("-".repeat(header.length));

  for (const row of rows) {
    let line = row.name.slice(0, nw - 1).padEnd(nw) + row.widthFactor.toFixed(1).padStart(4);
    for (const r of allRatios) {
      const s = row.scales.find((s) => s.ratio === r);
      line += (s ? `£${s.suggested}` : ".").padStart(cw);
    }
    console.log(line);
  }

  // Diff (current - suggested)
  console.log("\nDIFFERENCE (current - suggested, + = you charge more, - = you charge less):");
  console.log(header.replace("Building", "Building").replace(/1:/g, "1:"));
  console.log("-".repeat(header.length));

  const changes: Array<{
    listingId: number;
    name: string;
    ratio: number;
    heightCm: number;
    current: number;
    suggested: number;
    diff: number;
    matCost: number;
    weightG: number;
  }> = [];

  for (const row of rows) {
    let line = row.name.slice(0, nw - 1).padEnd(nw) + row.widthFactor.toFixed(1).padStart(4);
    for (const r of allRatios) {
      const s = row.scales.find((s) => s.ratio === r);
      if (s) {
        const diff = s.currentPrice - s.suggested;
        const flag = Math.abs(diff) > 15 ? "*" : "";
        line += (`${diff >= 0 ? "+" : ""}${diff}${flag}`).padStart(cw);
        changes.push({
          listingId: row.listingId, name: row.name, ratio: s.ratio,
          heightCm: s.heightCm, current: s.currentPrice, suggested: s.suggested,
          diff, matCost: s.matCost, weightG: s.weightG,
        });
      } else {
        line += ".".padStart(cw);
      }
    }
    console.log(line);
  }

  // ─── Oddities ──────────────────────────────────────
  console.log("\n" + "=".repeat(120));
  console.log("NOTES");
  console.log("=".repeat(120));

  if (has500) {
    const with500 = rows.filter((r) => r.scales.some((s) => s.ratio === 500));
    console.log(`\n1:500 scale only used by: ${with500.map((r) => r.name).join(", ")}`);
    console.log("  Consider dropping 1:500 and using 1:600 instead for consistency.");
  }

  // Flag where Chrysler 1:1200 and 1:1000 were both £30 (now fixed to £38)
  const chrysler = rows.find((r) => r.name === "Chrysler Building");
  if (chrysler) {
    const s1200 = chrysler.scales.find((s) => s.ratio === 1200);
    const s1000 = chrysler.scales.find((s) => s.ratio === 1000);
    if (s1200 && s1000 && s1200.currentPrice === s1000.currentPrice) {
      console.log(`\nChrysler Building 1:1200 and 1:1000 same price (£${s1200.currentPrice}) — needs fixing`);
    }
  }

  // Flag items significantly above/below suggestion
  const big = changes.filter((c) => Math.abs(c.diff) > 15).sort((a, b) => a.diff - b.diff);
  if (big.length > 0) {
    console.log("\nBIG DEVIATIONS from suggested (>£15):");
    for (const c of big) {
      const dir = c.diff > 0 ? "ABOVE" : "BELOW";
      console.log(`  ${c.name.padEnd(28)} 1:${c.ratio}  £${c.current} vs £${c.suggested} (${dir} by £${Math.abs(c.diff)}, material: £${c.matCost.toFixed(0)}, ${Math.round(c.weightG)}g)`);
    }
  }

  // ─── Competitor context ──────────────────────────────
  console.log("\nCOMPETITOR CONTEXT (physical 3D printed building models on Etsy):");
  console.log("  Small models (~15-25cm): competitors charge £12-30");
  console.log("  Medium models (~30-50cm): competitors charge £25-60");
  console.log("  Large models (~50-80cm): competitors charge £60-120");
  console.log("  XL models (~80cm+): very few competitors, £80-200");
  console.log("  Median competitor price: ~£39 (mix of sizes)");

  // ─── Save recommendations ───────────────────────────
  const recommendations = rows.map((row) => ({
    listingId: row.listingId,
    name: row.name,
    widthFactor: row.widthFactor,
    scales: row.scales.map((s) => ({
      ratio: s.ratio,
      heightCm: s.heightCm,
      currentPrice: s.currentPrice,
      suggestedPrice: s.suggested,
      diff: s.currentPrice - s.suggested,
      estimatedWeightG: Math.round(s.weightG),
      materialCostGBP: Math.round(s.matCost),
    })),
  }));

  await writeFile(OUTPUT_PATH, JSON.stringify(recommendations, null, 2) + "\n");
  console.log(`\nSaved to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
