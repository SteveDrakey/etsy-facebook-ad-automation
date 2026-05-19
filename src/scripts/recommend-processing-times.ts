/**
 * Recommend per-listing processing times based on print weight.
 *
 * READ-ONLY. Does not write to Etsy. Print weight is a proxy for print time,
 * computed using the price-calc formula:
 *     weight = 39g * (heightCm/30)^2.5 * widthFactor^2 * (multiColour ? 1.5 : 1)
 *
 * Then tiered by weight to a processing-time bucket. Apply changes manually
 * in Shop Manager (per-listing or per-variation as appropriate).
 *
 * Tiers (by largest-scale print weight per listing):
 *     <=  150 g  -> 1-3 business days
 *     150-500 g  -> 3-5 business days
 *     >   500 g  -> 1-2 weeks
 *
 * Per-listing overrides:
 *     World Trade Center (Twin Towers) -> x1.2 (slow print)
 *
 * Usage: npx tsx src/scripts/recommend-processing-times.ts
 */
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INVENTORY_PATH = join(__dirname, "../../data/inventory.json");

// ─── Weight formula (lifted from src/scripts/price-calc.ts) ──
const REF_HEIGHT_CM = 30;
const REF_WEIGHT_G = 39;
const SCALING_EXPONENT = 2.5;
const MULTICOLOUR_MULT = 1.5;

interface BuildingProfile {
  realHeightM: number;
  widthFactor: number;
  multiColour: boolean;
}

// Mirror of BUILDINGS in price-calc.ts:104-160
const BUILDINGS: Record<string, BuildingProfile> = {
  "Burj Khalifa": { realHeightM: 828, widthFactor: 0.8, multiColour: false },
  "Merdeka 118": { realHeightM: 679, widthFactor: 1.0, multiColour: false },
  "Shanghai Tower": { realHeightM: 632, widthFactor: 1.3, multiColour: false },
  "Jeddah Tower": { realHeightM: 1000, widthFactor: 0.8, multiColour: false },
  "Lotte World Tower": { realHeightM: 555, widthFactor: 0.9, multiColour: false },
  "Grollo Tower (1997)": { realHeightM: 678, widthFactor: 0.9, multiColour: false },
  "Grollo Tower (2001)": { realHeightM: 560, widthFactor: 0.9, multiColour: false },
  "One World Trade Center": { realHeightM: 541, widthFactor: 1.1, multiColour: false },
  "Taipei 101": { realHeightM: 508, widthFactor: 1.3, multiColour: false },
  "China Zun (CITIC Tower)": { realHeightM: 528, widthFactor: 1.1, multiColour: false },
  "Goldin Finance 117": { realHeightM: 597, widthFactor: 1.0, multiColour: false },
  "Princess Tower Dubai": { realHeightM: 414, widthFactor: 0.9, multiColour: false },
  "Gevora Hotel": { realHeightM: 356, widthFactor: 0.9, multiColour: false },
  "Q1 Tower": { realHeightM: 323, widthFactor: 0.9, multiColour: false },
  "Jin Mao Tower": { realHeightM: 421, widthFactor: 1.2, multiColour: false },
  "The Shard": { realHeightM: 310, widthFactor: 0.7, multiColour: false },
  "Empire State Building": { realHeightM: 443, widthFactor: 1.5, multiColour: false },
  "Chrysler Building": { realHeightM: 319, widthFactor: 1.3, multiColour: false },
  "Shanghai World Financial Center": { realHeightM: 492, widthFactor: 1.2, multiColour: false },
  "Hancock Tower": { realHeightM: 457, widthFactor: 1.4, multiColour: false },
  "432 Park Avenue": { realHeightM: 426, widthFactor: 0.7, multiColour: true },
  "Oriental Pearl Tower": { realHeightM: 468, widthFactor: 1.8, multiColour: false },
  "Petronas Twin Towers": { realHeightM: 452, widthFactor: 2.5, multiColour: false },
  "Willis Tower": { realHeightM: 442, widthFactor: 2.2, multiColour: true },
  "Ryugyong Hotel": { realHeightM: 330, widthFactor: 2.0, multiColour: false },
  "The Gherkin": { realHeightM: 180, widthFactor: 1.8, multiColour: false },
  "Walkie Talkie Building": { realHeightM: 160, widthFactor: 2.0, multiColour: false },
  "BT Tower": { realHeightM: 177, widthFactor: 0.9, multiColour: false },
  "NatWest Tower": { realHeightM: 183, widthFactor: 1.0, multiColour: false },
  "Flatiron Building": { realHeightM: 87, widthFactor: 1.5, multiColour: false },
  "Leadenhall Building": { realHeightM: 225, widthFactor: 1.6, multiColour: true },
  "Merdeka 118 Shiny": { realHeightM: 679, widthFactor: 1.0, multiColour: true },
  "Chrysler Building Colour": { realHeightM: 319, widthFactor: 1.3, multiColour: true },
  "One World Trade Center Colour": { realHeightM: 541, widthFactor: 1.1, multiColour: true },
  "Lotte World Tower Colour": { realHeightM: 555, widthFactor: 0.9, multiColour: true },
  "The Gherkin Colour": { realHeightM: 180, widthFactor: 1.8, multiColour: true },
  "Walkie Talkie Building Colour": { realHeightM: 160, widthFactor: 2.0, multiColour: true },
  "Shanghai World Financial Center Colour": { realHeightM: 492, widthFactor: 1.2, multiColour: true },
  "St. Peter's Basilica (Facade)": { realHeightM: 136, widthFactor: 3.0, multiColour: false },
  "St. Peter's Basilica & Square": { realHeightM: 136, widthFactor: 5.0, multiColour: false },
  "Lotus Temple": { realHeightM: 34, widthFactor: 4.0, multiColour: false },
  "Santa Ana Cathedral (Facade)": { realHeightM: 34, widthFactor: 3.0, multiColour: false },
  "Sagrada Familia (Facade)": { realHeightM: 172, widthFactor: 3.5, multiColour: false },
  "World Trade Center (Twin Towers)": { realHeightM: 417, widthFactor: 2.5, multiColour: false },
  "Wrigley Field Stadium": { realHeightM: 30, widthFactor: 8.0, multiColour: false },
  // Skyline / cityscape composites — treat as bulky/wide
  "London Skyline Bundle": { realHeightM: 310, widthFactor: 6.0, multiColour: false },
  "Shanghai Skyline Bundle": { realHeightM: 632, widthFactor: 6.0, multiColour: false },
  "New York City Times Square Skyline": { realHeightM: 380, widthFactor: 7.0, multiColour: false },
  "San Francisco Downtown Skyline": { realHeightM: 260, widthFactor: 7.0, multiColour: false },
  "San Francisco Downtown": { realHeightM: 260, widthFactor: 8.0, multiColour: false },
  "Miniature Shanghai": { realHeightM: 200, widthFactor: 6.0, multiColour: false },
  "Canary Wharf": { realHeightM: 235, widthFactor: 5.0, multiColour: false },
};

// Per-listing weight overrides — multiplier on computed weight
const WEIGHT_OVERRIDES: Record<number, { mult: number; reason: string }> = {
  4426197221: { mult: 1.2, reason: "WTC Twin Towers — slow print" },
};

// Skip non-architectural items (per memory: feedback_bulk_listing_scope.md)
const EXCLUDE_IDS = new Set<number>([
  4438786249, // Spare Parts
  4503821733, // Retro Radio
]);

interface Tier {
  label: string;
  min: number;
  max: number;
}
const TIER_SMALL: Tier = { label: "1-3 days", min: 1, max: 3 };
const TIER_MEDIUM: Tier = { label: "3-5 days", min: 3, max: 5 };
const TIER_LARGE: Tier = { label: "1-2 weeks", min: 7, max: 14 };

function pickTier(weightG: number): Tier {
  if (weightG <= 150) return TIER_SMALL;
  if (weightG <= 500) return TIER_MEDIUM;
  return TIER_LARGE;
}

function computeWeight(heightCm: number, profile: BuildingProfile): number {
  const heightRatio = heightCm / REF_HEIGHT_CM;
  const colour = profile.multiColour ? MULTICOLOUR_MULT : 1.0;
  return (
    REF_WEIGHT_G *
    Math.pow(heightRatio, SCALING_EXPONENT) *
    Math.pow(profile.widthFactor, 2) *
    colour
  );
}

function matchBuilding(title: string): string | null {
  const t = title.toLowerCase();
  if (t.includes("shiny") && t.includes("merdeka")) return "Merdeka 118 Shiny";
  if (t.includes("colour") && t.includes("chrysler")) return "Chrysler Building Colour";
  if (t.includes("colour") && t.includes("one world")) return "One World Trade Center Colour";
  if (t.includes("multi-colour") && t.includes("lotte")) return "Lotte World Tower Colour";
  if (t.includes("colour") && t.includes("lotte")) return "Lotte World Tower Colour";
  if (t.includes("colour") && t.includes("gherkin")) return "The Gherkin Colour";
  if (t.includes("multi colour") && t.includes("walkie")) return "Walkie Talkie Building Colour";
  if (t.includes("colour") && t.includes("walkie")) return "Walkie Talkie Building Colour";
  if (t.includes("colour") && t.includes("shanghai world")) return "Shanghai World Financial Center Colour";

  const candidates = Object.keys(BUILDINGS).sort((a, b) => b.length - a.length);
  for (const name of candidates) {
    if (t.includes(name.toLowerCase())) return name;
  }
  return null;
}

interface Offering {
  price: { amount: number; divisor: number };
  is_enabled: boolean;
}
interface Product {
  is_deleted: boolean;
  offerings: Offering[];
  property_values: Array<{ property_name: string; values: string[] }>;
}
interface Listing {
  listing_id: number;
  title: string;
  state?: string;
  processing_min?: number;
  processing_max?: number;
  inventory?: { products: Product[] };
}

function parseScaleHeight(val: string): number | null {
  const m = val.match(/1:(\d+)\s*[-–—]\s*([\d.]+)\s*cm/);
  if (m) return parseFloat(m[2]);
  // Plain "XXcm"
  const cm = val.match(/([\d.]+)\s*cm/i);
  if (cm) return parseFloat(cm[1]);
  return null;
}

interface Row {
  listingId: number;
  title: string;
  building: string | null;
  largestHeightCm: number | null;
  weightG: number | null;
  override: { mult: number; reason: string } | null;
  currentMin: number | undefined;
  currentMax: number | undefined;
  tier: Tier;
  source: "matched" | "default";
}

async function main() {
  const listings: Listing[] = JSON.parse(await readFile(INVENTORY_PATH, "utf-8"));
  const rows: Row[] = [];

  for (const listing of listings) {
    if (EXCLUDE_IDS.has(listing.listing_id)) continue;
    if (listing.state && listing.state !== "active") continue;

    const buildingName = matchBuilding(listing.title);
    const profile = buildingName ? BUILDINGS[buildingName] : null;

    // Find the LARGEST scale variation for this listing (worst-case print time)
    let largestHeightCm: number | null = null;
    const products = listing.inventory?.products?.filter((p) => !p.is_deleted) ?? [];
    for (const p of products) {
      const sv = p.property_values.find(
        (pv) => pv.property_name === "Scale" || pv.property_name === "Size"
      );
      if (!sv) continue;
      for (const v of sv.values) {
        const h = parseScaleHeight(v);
        if (h !== null && (largestHeightCm === null || h > largestHeightCm)) {
          largestHeightCm = h;
        }
      }
    }

    let weightG: number | null = null;
    let source: "matched" | "default" = "default";
    let tier = TIER_MEDIUM;

    if (profile && largestHeightCm !== null) {
      weightG = computeWeight(largestHeightCm, profile);
      const override = WEIGHT_OVERRIDES[listing.listing_id];
      if (override) weightG *= override.mult;
      tier = pickTier(weightG);
      source = "matched";
    }

    rows.push({
      listingId: listing.listing_id,
      title: listing.title,
      building: buildingName,
      largestHeightCm,
      weightG,
      override: WEIGHT_OVERRIDES[listing.listing_id] ?? null,
      currentMin: listing.processing_min,
      currentMax: listing.processing_max,
      tier,
      source,
    });
  }

  // Sort by tier (1-3 first), then weight
  const tierOrder: Record<string, number> = { "1-3 days": 0, "3-5 days": 1, "1-2 weeks": 2 };
  rows.sort((a, b) => {
    const ta = tierOrder[a.tier.label];
    const tb = tierOrder[b.tier.label];
    if (ta !== tb) return ta - tb;
    return (b.weightG ?? 0) - (a.weightG ?? 0);
  });

  console.log("=".repeat(120));
  console.log("PROCESSING-TIME RECOMMENDATIONS (read-only — apply in Shop Manager)");
  console.log("=".repeat(120));
  console.log("Weight formula: 39g × (h/30)^2.5 × widthFactor² × multiColour (1.5 if true)");
  console.log("Tiers: <=150g → 1-3 days | 150-500g → 3-5 days | >500g → 1-2 weeks\n");

  const counts = { "1-3 days": 0, "3-5 days": 0, "1-2 weeks": 0 };
  const changes: Row[] = [];

  for (const r of rows) {
    counts[r.tier.label as keyof typeof counts]++;
    const cur = r.currentMin !== undefined ? `${r.currentMin}-${r.currentMax}d` : "?";
    const same = r.currentMin === r.tier.min && r.currentMax === r.tier.max;
    if (!same) changes.push(r);
    const flag = same ? " " : "→";
    const wt = r.weightG !== null ? `${Math.round(r.weightG)}g` : "—";
    const ov = r.override ? ` [×${r.override.mult}]` : "";
    const src = r.source === "default" ? " (no profile)" : "";
    console.log(
      `${flag} ${r.tier.label.padEnd(10)} | ${cur.padStart(6)} → ${r.tier.min}-${r.tier.max}d | ` +
        `${wt.padStart(7)}${ov.padEnd(8)} | ${r.title.slice(0, 60)}${src}`
    );
  }

  console.log(`\n— Summary —`);
  console.log(`Total: ${rows.length}`);
  console.log(`Tiers: 1-3 days: ${counts["1-3 days"]} | 3-5 days: ${counts["3-5 days"]} | 1-2 weeks: ${counts["1-2 weeks"]}`);
  console.log(`Changes needed: ${changes.length}`);
  console.log(`Already correct: ${rows.length - changes.length}`);

  const unmatched = rows.filter((r) => r.source === "default");
  if (unmatched.length > 0) {
    console.log(`\n⚠ ${unmatched.length} listings have no building profile (defaulted to 3-5 days):`);
    for (const r of unmatched) console.log(`    ${r.listingId}  ${r.title.slice(0, 75)}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
