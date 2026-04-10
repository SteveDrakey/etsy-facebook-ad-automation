/**
 * Fix Grollo Tower prices — both listings were created with the wrong formula.
 * Corrects to: price = 6 + 5.30 × √(weight_g)
 *
 * Usage: npx tsx src/scripts/fix-grollo-prices.ts [--apply]
 */
import "dotenv/config";
import { updateListingPrices, type PriceChange } from "../etsy/inventory-update.js";

const GROLLO_1997_ID = 4485639625;
const GROLLO_2001_ID = 4485639629;

const grollo1997: PriceChange[] = [
  { scaleMatch: "1:3000", newPrice: 27 },
  { scaleMatch: "1:2000", newPrice: 41 },
  { scaleMatch: "1:1200", newPrice: 72 },
  { scaleMatch: "1:1000", newPrice: 89 },
  { scaleMatch: "1:800", newPrice: 115 },
  { scaleMatch: "1:600", newPrice: 162 },
  { scaleMatch: "1:400", newPrice: 265 },
];

const grollo2001: PriceChange[] = [
  { scaleMatch: "1:3000", newPrice: 22 },
  { scaleMatch: "1:2000", newPrice: 33 },
  { scaleMatch: "1:1200", newPrice: 58 },
  { scaleMatch: "1:1000", newPrice: 71 },
  { scaleMatch: "1:800", newPrice: 92 },
  { scaleMatch: "1:600", newPrice: 129 },
  { scaleMatch: "1:400", newPrice: 210 },
];

async function main() {
  const apply = process.argv.includes("--apply");

  await updateListingPrices(GROLLO_1997_ID, grollo1997, !apply);
  await updateListingPrices(GROLLO_2001_ID, grollo2001, !apply);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
