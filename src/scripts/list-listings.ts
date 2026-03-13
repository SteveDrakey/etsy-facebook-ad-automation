import { getActiveListings } from "../etsy/client.js";
import { loadState, getPostedListingIds } from "../state/store.js";

async function main() {
  const result = await getActiveListings();
  const state = await loadState();
  const postedIds = getPostedListingIds(state);
  console.log(`Source: ${result.source}\n`);
  for (const l of result.listings) {
    const posted = postedIds.has(l.listing_id) ? " [POSTED]" : "";
    const price = (l.price.amount / l.price.divisor).toFixed(2);
    console.log(`${l.listing_id} | ${l.title} | £${price}${posted}`);
  }
}

main().catch(console.error);
