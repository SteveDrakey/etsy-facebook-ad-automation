/**
 * Boost the latest unpromoted Facebook post.
 * Uses one persistent campaign, creates a new ad set + ad under it.
 * The ad uses the original post (object_story_id) so it appears as a
 * "boosted post" in Facebook Business Suite.
 *
 * Usage:
 *   npx tsx src/scripts/promote-weekly.ts            # boost post (ACTIVE)
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
  console.log(dryRun ? "[DRY RUN] Preview mode\n" : "Boosting post...\n");

  const state = await loadState();
  const unpromoted = getUnpromotedPosts(state);
  console.log(`Unpromoted posts: ${unpromoted.length}`);

  if (unpromoted.length === 0) {
    console.log("No unpromoted posts. Post some listings first.");
    return;
  }

  const entry = unpromoted[unpromoted.length - 1];
  console.log(`\nBoosting post: ${entry.postId}`);
  console.log(`  Listing: ${entry.listingId}`);
  console.log(`  Etsy URL: ${entry.etsyUrl}`);
  console.log(`  Budget: £${(AD_BUDGET_PENCE / 100).toFixed(2)} over ${AD_DURATION_DAYS} days`);

  if (dryRun) {
    console.log("\n[DRY RUN] Would boost post. Skipping.");
    return;
  }

  const result = await promotePost(entry.postId, entry.etsyUrl, "", AD_BUDGET_PENCE, AD_DURATION_DAYS);
  console.log(`\n  Campaign: ${result.campaignId} (persistent)`);
  console.log(`  Ad Set:   ${result.adSetId}`);
  console.log(`  Ad:       ${result.adId} (ACTIVE - boosted post)`);

  markAsPromoted(state, entry.postId, result);
  await saveState(state);

  console.log("\nDone! Post is now boosted and will appear in Business Suite.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
