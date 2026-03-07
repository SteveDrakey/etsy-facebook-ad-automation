/**
 * Promote the latest unpromoted Facebook post as an ad.
 * Uses one persistent campaign, creates a new ad set + ad under it.
 *
 * Usage:
 *   npx tsx src/scripts/promote-weekly.ts            # create ad (ACTIVE)
 *   npx tsx src/scripts/promote-weekly.ts --dry-run   # preview only
 */
import { promotePost } from "../facebook/client.js";
import {
  loadState,
  saveState,
  getUnpromotedPosts,
  markAsPromoted,
} from "../state/store.js";
import { AD_BUDGET_PENCE, AD_DURATION_DAYS } from "../config.js";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(dryRun ? "[DRY RUN] Preview mode\n" : "Creating ad...\n");

  const state = await loadState();
  const unpromoted = getUnpromotedPosts(state);
  console.log(`Unpromoted posts: ${unpromoted.length}`);

  if (unpromoted.length === 0) {
    console.log("No unpromoted posts. Post some listings first.");
    return;
  }

  const entry = unpromoted[unpromoted.length - 1];
  console.log(`\nPromoting post: ${entry.postId}`);
  console.log(`  Listing: ${entry.listingId}`);
  console.log(`  Etsy URL: ${entry.etsyUrl}`);
  console.log(`  Budget: £${(AD_BUDGET_PENCE / 100).toFixed(2)} over ${AD_DURATION_DAYS} days`);

  if (dryRun) {
    console.log("\n[DRY RUN] Would create ad. Skipping.");
    return;
  }

  const result = await promotePost(entry.postId, entry.etsyUrl);
  console.log(`\n  Campaign: ${result.campaignId} (persistent)`);
  console.log(`  Ad Set:   ${result.adSetId}`);
  console.log(`  Creative: ${result.creativeId}`);
  console.log(`  Ad:       ${result.adId} (ACTIVE)`);
  console.log(`  CTA:      Shop Now -> ${entry.etsyUrl}`);

  markAsPromoted(state, entry.postId, result);
  await saveState(state);

  console.log("\nDone! Ad is live with Shop Now button.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
