/**
 * Analyses pricing across all listings and scales.
 * Considers cubic material scaling, building width/shape, and multi-colour premium.
 *
 * Usage: npx tsx src/scripts/analyse-pricing.ts
 */
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INVENTORY_PATH = join(__dirname, "../../data/inventory.json");

interface Offering {
  price: { amount: number; divisor: number; currency_code: string };
  quantity: number;
  is_enabled: boolean;
}

interface Product {
  product_id: number;
  is_deleted: boolean;
  offerings: Offering[];
  property_values: Array<{
    property_id: number;
    property_name: string;
    values: string[];
  }>;
}

interface Listing {
  listing_id: number;
  title: string;
  description: string;
  url: string;
  tags: string[];
  price: { amount: number; divisor: number; currency_code: string };
  has_variations: boolean;
  inventory?: { products: Product[] };
}

function price(o: Offering): number {
  return o.price.amount / o.price.divisor;
}

function parseScale(val: string): { ratio: number; heightCm: number } | null {
  // e.g. "1:3000 - 27.6 cm" or "1:2000 - 41.4 cm"
  const m = val.match(/1:(\d+)\s*[-–—]\s*([\d.]+)\s*cm/);
  if (!m) return null;
  return { ratio: parseInt(m[1]), heightCm: parseFloat(m[2]) };
}

interface ScalePrice {
  scale: string;
  ratio: number;
  heightCm: number;
  price: number;
  colour: string;
}

interface ListingAnalysis {
  title: string;
  listingId: number;
  isMultiColour: boolean;
  type: "single" | "bundle" | "cityscape" | "stadium" | "landmark" | "spare";
  scalePrices: ScalePrice[];
  colourCount: number;
  scales: string[];
}

function classifyListing(title: string): ListingAnalysis["type"] {
  const t = title.toLowerCase();
  if (t.includes("spare")) return "spare";
  if (t.includes("bundle") || t.includes("skyline") || t.includes("collection")) return "bundle";
  if (t.includes("cityscape") || t.includes("city map") || t.includes("downtown") || t.includes("canary wharf")) return "cityscape";
  if (t.includes("stadium") || t.includes("field")) return "stadium";
  if (t.includes("basilica") || t.includes("temple") || t.includes("lotus")) return "landmark";
  return "single";
}

function isMultiColour(title: string): boolean {
  const t = title.toLowerCase();
  return t.includes("colour") || t.includes("color") || t.includes("multi") || t.includes("shiny");
}

async function main() {
  const raw = await readFile(INVENTORY_PATH, "utf-8");
  const listings: Listing[] = JSON.parse(raw);

  const analyses: ListingAnalysis[] = [];

  for (const l of listings) {
    const products = l.inventory?.products?.filter((p) => !p.is_deleted) ?? [];
    const multi = isMultiColour(l.title);
    const type = classifyListing(l.title);

    const scalePrices: ScalePrice[] = [];
    const colours = new Set<string>();
    const scales = new Set<string>();

    for (const p of products) {
      const scaleProp = p.property_values.find(
        (pv) => pv.property_name === "Scale" || pv.property_name === "Size"
      );
      const colourProp = p.property_values.find(
        (pv) => pv.property_name === "Primary color" || pv.property_name === "Color"
      );

      const scaleVal = scaleProp?.values[0] ?? "default";
      const colourVal = colourProp?.values[0] ?? "default";
      colours.add(colourVal);

      const parsed = parseScale(scaleVal);
      for (const o of p.offerings) {
        if (!o.is_enabled) continue;
        scalePrices.push({
          scale: scaleVal,
          ratio: parsed?.ratio ?? 0,
          heightCm: parsed?.heightCm ?? 0,
          price: price(o),
          colour: colourVal,
        });
        scales.add(scaleVal);
      }
    }

    analyses.push({
      title: l.title,
      listingId: l.listing_id,
      isMultiColour: multi,
      type,
      scalePrices,
      colourCount: colours.size,
      scales: [...scales],
    });
  }

  // ─── Report: Single-colour towers by scale ───────────────
  console.log("=" .repeat(90));
  console.log("PRICING ANALYSIS: Single-Colour Towers by Scale");
  console.log("=" .repeat(90));

  const singleTowers = analyses.filter(
    (a) => a.type === "single" && !a.isMultiColour && a.scalePrices.length > 1
  );

  // Get unique scale ratios across all towers
  const allRatios = [...new Set(singleTowers.flatMap((t) => t.scalePrices.map((sp) => sp.ratio)))].filter(r => r > 0).sort((a, b) => b - a);

  // Header
  const nameWidth = 35;
  const colWidth = 10;
  const header = "Building".padEnd(nameWidth) + allRatios.map((r) => `1:${r}`.padStart(colWidth)).join("");
  console.log(header);
  console.log("-".repeat(header.length));

  for (const tower of singleTowers.sort((a, b) => a.title.localeCompare(b.title))) {
    // Use first colour only to avoid repetition
    const firstColour = tower.scalePrices[0]?.colour;
    const priceByRatio = new Map<number, number>();
    for (const sp of tower.scalePrices) {
      if (sp.colour === firstColour && sp.ratio > 0) {
        priceByRatio.set(sp.ratio, sp.price);
      }
    }

    const shortTitle = tower.title.replace(/ – 3D Printed.*/, "").replace(/ - 3D Printed.*/, "").slice(0, nameWidth - 1);
    let row = shortTitle.padEnd(nameWidth);
    for (const r of allRatios) {
      const p = priceByRatio.get(r);
      row += (p ? `£${p}` : "-").padStart(colWidth);
    }
    console.log(row);
  }

  // ─── Report: Price ratios between scales ───────────────
  console.log("\n" + "=".repeat(90));
  console.log("SCALE-UP COST MULTIPLIERS (relative to smallest scale)");
  console.log("If material scales cubically, doubling height = 8x material cost");
  console.log("=".repeat(90));

  for (const tower of singleTowers.sort((a, b) => a.title.localeCompare(b.title))) {
    const firstColour = tower.scalePrices[0]?.colour;
    const entries = tower.scalePrices
      .filter((sp) => sp.colour === firstColour && sp.ratio > 0)
      .sort((a, b) => b.ratio - a.ratio); // smallest model first (biggest ratio)

    if (entries.length < 2) continue;

    const basePrice = entries[0].price;
    const baseHeight = entries[0].heightCm;
    const shortTitle = tower.title.replace(/ – 3D Printed.*/, "").replace(/ - 3D Printed.*/, "").slice(0, 34);

    console.log(`\n${shortTitle}`);
    for (const e of entries) {
      const priceMult = e.price / basePrice;
      const heightMult = e.heightCm / baseHeight;
      const cubicMult = Math.pow(heightMult, 3);
      const priceVsCubic = e.price / (basePrice * cubicMult);
      console.log(
        `  ${e.scale.padEnd(22)} £${e.price.toString().padEnd(6)} ` +
        `height: ${heightMult.toFixed(1)}x  cubic-material: ${cubicMult.toFixed(1)}x  ` +
        `price: ${priceMult.toFixed(1)}x  price/cubic: ${priceVsCubic.toFixed(2)}`
      );
    }
  }

  // ─── Report: Multi-colour premiums ───────────────
  console.log("\n" + "=".repeat(90));
  console.log("MULTI-COLOUR vs SINGLE-COLOUR COMPARISON");
  console.log("=".repeat(90));

  // Find buildings that have both a mono and colour listing
  const monoByName = new Map<string, ListingAnalysis>();
  const colourByName = new Map<string, ListingAnalysis>();

  for (const a of analyses) {
    if (a.type !== "single") continue;
    // Normalise name
    const name = a.title
      .replace(/ – 3D Printed.*/, "").replace(/ - 3D Printed.*/, "")
      .replace(/– Full.*/i, "").replace(/– Fulll.*/i, "")
      .replace(/– Shiny.*/i, "")
      .replace(/ in (multi )?colou?r/i, "")
      .replace(/ – Multi-Colou?r.*/i, "")
      .trim();

    if (a.isMultiColour) {
      colourByName.set(name, a);
    } else {
      monoByName.set(name, a);
    }
  }

  for (const [name, mono] of monoByName) {
    const colour = colourByName.get(name);
    if (!colour) continue;

    console.log(`\n${name}`);

    // Get mono prices at each scale
    const monoPrices = new Map<number, number>();
    const firstMonoColour = mono.scalePrices[0]?.colour;
    for (const sp of mono.scalePrices) {
      if (sp.colour === firstMonoColour && sp.ratio > 0) monoPrices.set(sp.ratio, sp.price);
    }

    const colourPrices = new Map<number, number>();
    const firstColourColour = colour.scalePrices[0]?.colour;
    for (const sp of colour.scalePrices) {
      if (sp.colour === firstColourColour && sp.ratio > 0) colourPrices.set(sp.ratio, sp.price);
      // Some multi-colour have no scale variation, just one price
      if (sp.ratio === 0) colourPrices.set(0, sp.price);
    }

    if (colourPrices.has(0)) {
      // Single price for colour version
      const cp = colourPrices.get(0)!;
      for (const [ratio, mp] of monoPrices) {
        const premium = ((cp - mp) / mp * 100).toFixed(0);
        console.log(`  1:${ratio}  mono: £${mp}  colour: £${cp}  premium: ${premium}%`);
      }
    } else {
      for (const [ratio, mp] of monoPrices) {
        const cp = colourPrices.get(ratio);
        if (cp) {
          const premium = ((cp - mp) / mp * 100).toFixed(0);
          console.log(`  1:${ratio}  mono: £${mp}  colour: £${cp}  premium: ${premium}%`);
        }
      }
    }
  }

  // ─── Report: Bundles / cityscapes ───────────────
  console.log("\n" + "=".repeat(90));
  console.log("BUNDLES, CITYSCAPES & SPECIAL ITEMS");
  console.log("=".repeat(90));

  for (const a of analyses.filter((a) => a.type !== "single" && a.type !== "spare")) {
    console.log(`\n${a.title}`);
    console.log(`  Type: ${a.type} | Multi-colour: ${a.isMultiColour ? "YES" : "NO"}`);
    const seen = new Set<string>();
    for (const sp of a.scalePrices) {
      const key = `${sp.scale}|${sp.price}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  ${sp.scale.padEnd(25)} £${sp.price}`);
    }
  }

  // ─── Summary observations ───────────────
  console.log("\n" + "=".repeat(90));
  console.log("SUMMARY: Price vs Cubic Material Cost");
  console.log("=".repeat(90));

  // Collect all price/cubic ratios
  const allPriceCubicRatios: { title: string; scale: string; ratio: number }[] = [];

  for (const tower of singleTowers) {
    const firstColour = tower.scalePrices[0]?.colour;
    const entries = tower.scalePrices
      .filter((sp) => sp.colour === firstColour && sp.ratio > 0)
      .sort((a, b) => b.ratio - a.ratio);

    if (entries.length < 2) continue;

    const basePrice = entries[0].price;
    const baseHeight = entries[0].heightCm;

    for (const e of entries.slice(1)) {
      const heightMult = e.heightCm / baseHeight;
      const cubicMult = Math.pow(heightMult, 3);
      const priceVsCubic = e.price / (basePrice * cubicMult);
      allPriceCubicRatios.push({
        title: tower.title.replace(/ – 3D Printed.*/, "").slice(0, 30),
        scale: e.scale,
        ratio: priceVsCubic,
      });
    }
  }

  // Sort by ratio to find under/overpriced
  allPriceCubicRatios.sort((a, b) => a.ratio - b.ratio);

  console.log("\nMost UNDERPRICED relative to cubic material cost (ratio < 1.0 = below cubic):");
  for (const r of allPriceCubicRatios.slice(0, 10)) {
    console.log(`  ${r.title.padEnd(32)} ${r.scale.padEnd(22)} ratio: ${r.ratio.toFixed(3)}`);
  }

  console.log("\nMost OVERPRICED relative to cubic material cost (highest margins):");
  for (const r of allPriceCubicRatios.slice(-10).reverse()) {
    console.log(`  ${r.title.padEnd(32)} ${r.scale.padEnd(22)} ratio: ${r.ratio.toFixed(3)}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
