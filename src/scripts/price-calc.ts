/**
 * Price calculator for 3D printed skyscraper models.
 *
 * Calculates production cost and suggests prices. Postage is charged
 * separately via Etsy shipping profiles (£3 UK / £10 intl / £15 US DDP).
 *
 * Cost model:
 * - PLA material (cubic volume scaling from reference weight)
 * - Electricity (print time)
 * - Packaging (box/bubble wrap by size tier)
 * - Etsy fees: 6.5% transaction + 4% payment + £0.20 listing
 *   + 15% offsite ads on ~20% of sales = ~13.5% effective
 * - DDP duty 10% absorbed on ~30% of orders (US only)
 *
 * Pricing philosophy:
 * - Small models: fixed costs dominate, minimum viable price ~£20
 * - Large models: material dominates but margin % can be lower
 *   (don't charge 100x for 100x material — stay under competitors)
 * - Multi-colour: ~50% premium (waste, colour changes, slower)
 *
 * Usage: npx tsx src/scripts/price-calc.ts [--changes-only]
 */
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INVENTORY_PATH = join(__dirname, "../../data/inventory.json");

const changesOnly = process.argv.includes("--changes-only");

// ─── Cost parameters ────────────────────────────────────────

/** PLA spool cost £/kg */
const PLA_COST_PER_KG = 20;

/** PLA density g/cm³ */
const PLA_DENSITY = 1.24;

/** Electricity cost per print hour */
const ELECTRICITY_PER_HOUR = 0.05;

/** Print speed: cm³ of filament per hour */
const CM3_PER_HOUR = 25;

/**
 * Weight model: calibrated from real data (Jeddah 1:400 = 250cm = 5kg).
 * Uses h^2.5 exponent (not cubic) because hollow 3D prints scale between
 * surface area (h²) for walls and volume (h³) for infill.
 */
const REF_HEIGHT_CM = 30;
const REF_WEIGHT_G = 39;
const SCALING_EXPONENT = 2.5;

/** Packaging cost by model height */
const PACKAGING: [number, number][] = [
  // [maxHeightCm, costGBP]
  [15, 1.5],   // padded envelope / tiny box
  [30, 2.5],   // small box
  [60, 4.0],   // medium box
  [100, 6.0],  // large box
  [Infinity, 10.0], // oversized
];

/** Multi-colour multiplier on material + print time */
const MULTICOLOUR_MULT = 1.5;

/** Etsy effective fee rate */
const ETSY_FEE_RATE = 0.065 + 0.04 + 0.15 * 0.20; // = 13.5%
const ETSY_LISTING_FEE = 0.20;

/** DDP 10% on US orders (~30% of all orders) */
const DDP_RATE = 0.10;
const DDP_ORDER_SHARE = 0.30;

/** Minimum viable selling price. Postage is charged separately so the floor
 *  only needs to cover Etsy fees + packaging + small margin. */
const MIN_PRICE = 8;

/**
 * Markup tiers: material cost → multiplier on production cost.
 * Small items get higher multiplier (fixed costs dominate).
 * Large items get lower multiplier (stay competitive).
 */
const MARKUP_TIERS: [number, number][] = [
  // [maxMaterialCost, markup on total production cost]
  [2, 3.0],     // tiny models: £0-2 material → 3x production
  [10, 2.5],    // small models: £2-10 material → 2.5x
  [30, 2.0],    // medium models: £10-30 material → 2x
  [80, 1.7],    // large models: £30-80 → 1.7x
  [200, 1.5],   // XL models: £80-200 → 1.5x
  [Infinity, 1.35], // XXL: 200+ → 1.35x
];

// ─── Building shape profiles ────────────────────────────────

interface BuildingProfile {
  realHeightM: number;
  widthFactor: number;  // 1.0 = standard slim tower
  multiColour: boolean;
  type: "tower" | "pair" | "bundle" | "cityscape" | "landmark" | "stadium" | "spare";
}

const BUILDINGS: Record<string, BuildingProfile> = {
  // Slim towers
  "Burj Khalifa": { realHeightM: 828, widthFactor: 0.8, multiColour: false, type: "tower" },
  "Merdeka 118": { realHeightM: 679, widthFactor: 1.0, multiColour: false, type: "tower" },
  "Shanghai Tower": { realHeightM: 632, widthFactor: 1.3, multiColour: false, type: "tower" },
  "Jeddah Tower": { realHeightM: 1000, widthFactor: 0.8, multiColour: false, type: "tower" },
  "Lotte World Tower": { realHeightM: 555, widthFactor: 0.9, multiColour: false, type: "tower" },
  "One World Trade Center": { realHeightM: 541, widthFactor: 1.1, multiColour: false, type: "tower" },
  "Taipei 101": { realHeightM: 508, widthFactor: 1.3, multiColour: false, type: "tower" },
  "China Zun (CITIC Tower)": { realHeightM: 528, widthFactor: 1.1, multiColour: false, type: "tower" },
  "Goldin Finance 117": { realHeightM: 597, widthFactor: 1.0, multiColour: false, type: "tower" },
  "Princess Tower Dubai": { realHeightM: 414, widthFactor: 0.9, multiColour: false, type: "tower" },
  "Gevora Hotel": { realHeightM: 356, widthFactor: 0.9, multiColour: false, type: "tower" },
  "Q1 Tower": { realHeightM: 323, widthFactor: 0.9, multiColour: false, type: "tower" },
  "Jin Mao Tower": { realHeightM: 421, widthFactor: 1.2, multiColour: false, type: "tower" },
  "The Shard": { realHeightM: 310, widthFactor: 0.7, multiColour: false, type: "tower" },

  // Medium-width
  "Empire State Building": { realHeightM: 443, widthFactor: 1.5, multiColour: false, type: "tower" },
  "Chrysler Building": { realHeightM: 319, widthFactor: 1.3, multiColour: false, type: "tower" },
  "Shanghai World Financial Center": { realHeightM: 492, widthFactor: 1.2, multiColour: false, type: "tower" },
  "Hancock Tower": { realHeightM: 457, widthFactor: 1.4, multiColour: false, type: "tower" },
  "432 Park Avenue": { realHeightM: 426, widthFactor: 0.7, multiColour: true, type: "tower" },

  // Wide / complex
  "Oriental Pearl Tower": { realHeightM: 468, widthFactor: 1.8, multiColour: false, type: "tower" },
  "Petronas Twin Towers": { realHeightM: 452, widthFactor: 2.5, multiColour: false, type: "pair" },
  "Willis Tower": { realHeightM: 442, widthFactor: 2.2, multiColour: true, type: "tower" },
  "Ryugyong Hotel": { realHeightM: 330, widthFactor: 2.0, multiColour: false, type: "tower" },

  // Stocky
  "The Gherkin": { realHeightM: 180, widthFactor: 1.8, multiColour: false, type: "tower" },
  "Walkie Talkie Building": { realHeightM: 160, widthFactor: 2.0, multiColour: false, type: "tower" },
  "Flatiron Building": { realHeightM: 87, widthFactor: 1.5, multiColour: false, type: "tower" },
  "Leadenhall Building": { realHeightM: 225, widthFactor: 1.6, multiColour: true, type: "tower" },

  // Multi-colour variants
  "Merdeka 118 Shiny": { realHeightM: 679, widthFactor: 1.0, multiColour: true, type: "tower" },
  "Chrysler Building Colour": { realHeightM: 319, widthFactor: 1.3, multiColour: true, type: "tower" },
  "One World Trade Center Colour": { realHeightM: 541, widthFactor: 1.1, multiColour: true, type: "tower" },
  "Lotte World Tower Colour": { realHeightM: 555, widthFactor: 0.9, multiColour: true, type: "tower" },
  "The Gherkin Colour": { realHeightM: 180, widthFactor: 1.8, multiColour: true, type: "tower" },
  "Walkie Talkie Building Colour": { realHeightM: 160, widthFactor: 2.0, multiColour: true, type: "tower" },
  "Shanghai World Financial Center Colour": { realHeightM: 492, widthFactor: 1.2, multiColour: true, type: "tower" },

  // Landmarks & special
  "St. Peter's Basilica (Facade)": { realHeightM: 136, widthFactor: 3.0, multiColour: false, type: "landmark" },
  "St. Peter's Basilica & Square": { realHeightM: 136, widthFactor: 5.0, multiColour: false, type: "landmark" },
  "Lotus Temple": { realHeightM: 34, widthFactor: 4.0, multiColour: false, type: "landmark" },
  "World Trade Center (Twin Towers)": { realHeightM: 417, widthFactor: 2.5, multiColour: false, type: "pair" },
  "Wrigley Field Stadium": { realHeightM: 30, widthFactor: 8.0, multiColour: false, type: "stadium" },
};

// ─── Calculator ─────────────────────────────────────────────

function packagingCost(heightCm: number): number {
  for (const [max, cost] of PACKAGING) {
    if (heightCm <= max) return cost;
  }
  return 10;
}

function markupForMaterial(materialCost: number): number {
  for (const [max, mult] of MARKUP_TIERS) {
    if (materialCost <= max) return mult;
  }
  return 1.35;
}

interface CostResult {
  weightG: number;
  materialCost: number;
  electricityCost: number;
  packagingCost: number;
  productionCost: number; // material + electricity + packaging
  etsyFees: number;
  ddpCost: number;
  totalCost: number;      // everything the seller pays
  suggestedPrice: number;
  currentMarginPct: number; // calculated later
}

function calculateCost(heightCm: number, widthFactor: number, isMultiColour: boolean): CostResult {
  // Weight: cubic with height, quadratic with width, from reference
  const heightRatio = heightCm / REF_HEIGHT_CM;
  const weightG = REF_WEIGHT_G * Math.pow(heightRatio, SCALING_EXPONENT) * Math.pow(widthFactor, 2);

  const colourMult = isMultiColour ? MULTICOLOUR_MULT : 1.0;

  // Material
  const materialCost = (weightG / 1000) * PLA_COST_PER_KG * colourMult;

  // Electricity
  const volumeCm3 = weightG / PLA_DENSITY;
  const printHours = (volumeCm3 / CM3_PER_HOUR) * colourMult;
  const electricityCost = printHours * ELECTRICITY_PER_HOUR;

  // Packaging
  const pkg = packagingCost(heightCm);

  // Production cost (before fees)
  const productionCost = materialCost + electricityCost + pkg;

  // Suggested price: markup on production, ensure minimum
  const markup = markupForMaterial(materialCost);
  const rawPrice = Math.max(MIN_PRICE, productionCost * markup);

  // Add Etsy fees + DDP into the price
  // price = rawPrice / (1 - feeRate - ddpShare * ddpRate) + listing fee
  const feeAdjust = 1 - ETSY_FEE_RATE - (DDP_ORDER_SHARE * DDP_RATE);
  const suggestedPrice = Math.ceil(rawPrice / feeAdjust + ETSY_LISTING_FEE);

  // Calculate what Etsy takes + DDP at suggested price
  const etsyFees = suggestedPrice * ETSY_FEE_RATE + ETSY_LISTING_FEE;
  const ddpCost = suggestedPrice * DDP_ORDER_SHARE * DDP_RATE;
  const totalCost = productionCost + etsyFees + ddpCost;

  return {
    weightG,
    materialCost,
    electricityCost,
    packagingCost: pkg,
    productionCost,
    etsyFees,
    ddpCost,
    totalCost,
    suggestedPrice,
    currentMarginPct: 0, // filled in later
  };
}

// ─── Listing parsing ────────────────────────────────────────

interface Offering {
  price: { amount: number; divisor: number; currency_code: string };
  quantity: number;
  is_enabled: boolean;
}

interface Product {
  product_id: number;
  is_deleted: boolean;
  offerings: Offering[];
  property_values: Array<{ property_id: number; property_name: string; values: string[] }>;
}

interface Listing {
  listing_id: number;
  title: string;
  has_variations: boolean;
  price: { amount: number; divisor: number; currency_code: string };
  inventory?: { products: Product[] };
}

function matchBuilding(title: string): string | null {
  const t = title.toLowerCase();
  // Multi-colour variants first
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

// ─── Main ───────────────────────────────────────────────────

interface Row {
  listingId: number;
  building: string;
  scale: string;
  heightCm: number;
  weightG: number;
  materialCost: number;
  productionCost: number;
  totalCost: number;
  currentPrice: number;
  suggestedPrice: number;
  diff: number;
  marginPct: number;
  isMultiColour: boolean;
}

async function main() {
  const listings: Listing[] = JSON.parse(await readFile(INVENTORY_PATH, "utf-8"));
  const rows: Row[] = [];

  for (const listing of listings) {
    const buildingName = matchBuilding(listing.title);
    if (!buildingName) continue;
    const profile = BUILDINGS[buildingName];

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

      const currentPrice = offering.price.amount / offering.price.divisor;
      const cost = calculateCost(parsed.heightCm, profile.widthFactor, profile.multiColour);
      const marginPct = ((currentPrice - cost.totalCost) / currentPrice) * 100;

      rows.push({
        listingId: listing.listing_id,
        building: buildingName,
        scale: scaleVal,
        heightCm: parsed.heightCm,
        weightG: cost.weightG,
        materialCost: cost.materialCost,
        productionCost: cost.productionCost,
        totalCost: cost.totalCost,
        currentPrice,
        suggestedPrice: cost.suggestedPrice,
        diff: cost.suggestedPrice - currentPrice,
        marginPct,
        isMultiColour: profile.multiColour,
      });
    }
  }

  rows.sort((a, b) => a.building.localeCompare(b.building) || a.heightCm - b.heightCm);

  // ─── Full table ──────────────────────────────────
  if (!changesOnly) {
    console.log("=".repeat(130));
    console.log("PRICE CALCULATOR — All Listings with Scale Variations");
    console.log("=".repeat(130));
    console.log(`PLA: £${PLA_COST_PER_KG}/kg | Ref: ${REF_HEIGHT_CM}cm slim = ${REF_WEIGHT_G}g | Multi-colour: +${(MULTICOLOUR_MULT - 1) * 100}%`);
    console.log(`Etsy fees: ~${(ETSY_FEE_RATE * 100).toFixed(1)}% | DDP: ${DDP_RATE * 100}% on ${DDP_ORDER_SHARE * 100}% of orders | Min price: £${MIN_PRICE}`);
    console.log(`Postage charged separately: £3 UK / £10 intl / £15 US DDP\n`);

    const nw = 38, sw = 22, cw = 9;
    console.log(
      "Building".padEnd(nw) + "Scale".padEnd(sw) +
      "Height".padStart(cw) + "~Weight".padStart(cw) +
      "Matrl".padStart(cw) + "ProdCst".padStart(cw) +
      "TotCst".padStart(cw) + "Now".padStart(cw) +
      "Suggest".padStart(cw) + "Diff".padStart(cw) +
      "Margin".padStart(cw)
    );
    console.log("-".repeat(nw + sw + cw * 9));

    let cur = "";
    for (const r of rows) {
      const label = r.building !== cur ? r.building.slice(0, nw - 1) : "";
      cur = r.building;
      const diffStr = r.diff === 0 ? "=" : (r.diff > 0 ? `+${r.diff}` : `${r.diff}`);
      console.log(
        label.padEnd(nw) + r.scale.slice(0, sw - 1).padEnd(sw) +
        `${r.heightCm}`.padStart(cw) + `${Math.round(r.weightG)}g`.padStart(cw) +
        `£${r.materialCost.toFixed(0)}`.padStart(cw) + `£${r.productionCost.toFixed(0)}`.padStart(cw) +
        `£${r.totalCost.toFixed(0)}`.padStart(cw) + `£${r.currentPrice}`.padStart(cw) +
        `£${r.suggestedPrice}`.padStart(cw) + diffStr.padStart(cw) +
        `${r.marginPct.toFixed(0)}%`.padStart(cw)
      );
    }
  }

  // ─── Recommended changes ─────────────────────────
  // Only flag changes where diff is significant (>= £3 or losing money)
  const changes = rows.filter((r) => {
    if (r.currentPrice < r.totalCost) return true;  // losing money
    if (r.diff >= 3) return true;                     // underpriced by £3+
    if (r.marginPct < 15) return true;                // margin too thin
    return false;
  });

  // Also flag multi-colour listings with flat pricing across scales
  const flatPriceWarnings: string[] = [];
  const byBuilding = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byBuilding.has(r.building)) byBuilding.set(r.building, []);
    byBuilding.get(r.building)!.push(r);
  }
  for (const [name, bRows] of byBuilding) {
    if (bRows.length < 2) continue;
    const prices = new Set(bRows.map((r) => r.currentPrice));
    if (prices.size === 1 && bRows[0].heightCm !== bRows[bRows.length - 1].heightCm) {
      flatPriceWarnings.push(
        `${name}: flat £${bRows[0].currentPrice} across ${bRows.length} scales (${bRows[0].heightCm}cm to ${bRows[bRows.length - 1].heightCm}cm)`
      );
    }
  }

  console.log("\n" + "=".repeat(130));
  console.log("RECOMMENDED PRICE CHANGES");
  console.log("=".repeat(130));

  if (flatPriceWarnings.length > 0) {
    console.log("\n⚠ FLAT PRICING (same price across different sizes — likely needs fixing):");
    for (const w of flatPriceWarnings) console.log(`  ${w}`);
  }

  // Group changes: losing money vs underpriced vs thin margin
  const losers = changes.filter((r) => r.currentPrice < r.totalCost);
  const underpriced = changes.filter((r) => r.currentPrice >= r.totalCost && r.diff >= 3);
  const thinMargin = changes.filter((r) => r.currentPrice >= r.totalCost && r.diff < 3 && r.marginPct < 15);

  if (losers.length > 0) {
    console.log("\n🔴 BELOW COST (price doesn't cover production + fees):");
    for (const r of losers) {
      console.log(
        `  ${r.building.padEnd(38)} ${r.scale.padEnd(22)} ` +
        `£${r.currentPrice} → £${r.suggestedPrice}  ` +
        `(cost: £${r.totalCost.toFixed(0)}, material: £${r.materialCost.toFixed(0)}, currently ${r.marginPct.toFixed(0)}% margin)`
      );
    }
  }

  if (thinMargin.length > 0) {
    console.log("\n🟡 THIN MARGIN (< 15% after all costs):");
    for (const r of thinMargin) {
      console.log(
        `  ${r.building.padEnd(38)} ${r.scale.padEnd(22)} ` +
        `£${r.currentPrice} → £${r.suggestedPrice}  ` +
        `(${r.marginPct.toFixed(0)}% margin, material: £${r.materialCost.toFixed(0)})`
      );
    }
  }

  if (underpriced.length > 0) {
    console.log("\n🟢 COULD INCREASE (still profitable but below calculated suggestion):");
    for (const r of underpriced.sort((a, b) => b.diff - a.diff)) {
      console.log(
        `  ${r.building.padEnd(38)} ${r.scale.padEnd(22)} ` +
        `£${r.currentPrice} → £${r.suggestedPrice}  (+£${r.diff}, currently ${r.marginPct.toFixed(0)}% margin)`
      );
    }
  }

  // Items that are fine
  const okCount = rows.length - changes.length;
  console.log(`\n✓ ${okCount} of ${rows.length} price points look good (margin > 15%, within £3 of suggestion)`);

  // Summary stats
  const avgMargin = rows.reduce((s, r) => s + r.marginPct, 0) / rows.length;
  const minMargin = rows.reduce((m, r) => Math.min(m, r.marginPct), Infinity);
  const maxMargin = rows.reduce((m, r) => Math.max(m, r.marginPct), -Infinity);
  console.log(`\nMargin stats: avg ${avgMargin.toFixed(0)}% | min ${minMargin.toFixed(0)}% | max ${maxMargin.toFixed(0)}%`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
