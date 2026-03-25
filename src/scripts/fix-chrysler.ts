/**
 * Fix Chrysler Building 1:1000 price: £30 → £38
 * Currently same as 1:1200 (£30), should sit between £30 and £45.
 *
 * Usage:
 *   npx tsx src/scripts/fix-chrysler.ts          # dry run
 *   npx tsx src/scripts/fix-chrysler.ts --apply   # push to Etsy
 */
import { updateListingPrices } from "../etsy/inventory-update.js";

const CHRYSLER_ID = 4377428270;
const apply = process.argv.includes("--apply");

const result = await updateListingPrices(
  CHRYSLER_ID,
  [{ scaleMatch: "1:1000", newPrice: 38 }],
  !apply
);

if (!result.success) process.exit(1);
