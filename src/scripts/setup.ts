/**
 * Test all API connections and display configuration summary.
 * Usage: npx tsx src/scripts/setup.ts
 */
import { config } from "../config.js";
import { getActiveListings } from "../etsy/client.js";
import { getPageName, getAdAccountName } from "../facebook/client.js";

async function main() {
  console.log("=== Print Shop Setup ===\n");
  let allGood = true;

  // 1. Test Etsy API
  console.log("1. Etsy API");
  try {
    const { total, source } = await getActiveListings();
    console.log(`   Shop: ${config.etsy.shopName()}`);
    console.log(`   Active listings: ${total} (source: ${source})`);
    console.log("   Status: OK\n");
  } catch (err) {
    console.error(`   Error: ${err instanceof Error ? err.message : err}`);
    console.log("   Status: FAILED\n");
    allGood = false;
  }

  // 2. Test Facebook Page token
  console.log("2. Facebook Page");
  try {
    const pageName = await getPageName();
    console.log(`   Page: ${pageName} (ID: ${config.facebook.pageId()})`);
    console.log("   Status: OK\n");
  } catch (err) {
    console.error(`   Error: ${err instanceof Error ? err.message : err}`);
    console.log("   Status: FAILED\n");
    allGood = false;
  }

  // 3. Test Facebook Ad Account
  console.log("3. Facebook Ad Account");
  try {
    const accountName = await getAdAccountName();
    console.log(`   Account: ${accountName} (${config.facebook.adAccountId()})`);
    console.log("   Status: OK\n");
  } catch (err) {
    console.error(`   Error: ${err instanceof Error ? err.message : err}`);
    console.log("   Status: FAILED\n");
    allGood = false;
  }

  // 4. Test Anthropic API key (just check it's set)
  console.log("4. Anthropic API");
  try {
    config.anthropic.apiKey(); // throws if missing
    console.log("   API key: configured");
    console.log("   Status: OK\n");
  } catch (err) {
    console.error(`   Error: ${err instanceof Error ? err.message : err}`);
    console.log("   Status: FAILED\n");
    allGood = false;
  }

  // Summary
  console.log("=== Summary ===");
  if (allGood) {
    console.log("All connections OK. Ready to run:");
    console.log("  npx tsx src/scripts/post-weekly.ts --dry-run");
    console.log("  npx tsx src/scripts/promote-weekly.ts --dry-run");
  } else {
    console.log("Some connections failed. Check your .env file.");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
