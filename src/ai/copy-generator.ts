import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "../config.js";
import type { EtsyListing } from "../etsy/client.js";
import type { PagePost } from "../facebook/client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TONE_REF_PATH = join(__dirname, "../../data/tone-reference.json");

let client: Anthropic | null = null;
let toneExamples: string[] | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropic.apiKey() });
  }
  return client;
}

/** Load your real posts as a fixed tone reference (never degrades) */
async function getToneExamples(): Promise<string[]> {
  if (!toneExamples) {
    const raw = await readFile(TONE_REF_PATH, "utf-8");
    toneExamples = JSON.parse(raw);
  }
  return toneExamples!;
}

function formatPrice(listing: EtsyListing): string {
  const amount = listing.price.amount / listing.price.divisor;
  return `£${amount.toFixed(2)}`;
}

function listingSummary(l: EtsyListing): string {
  return `[ID:${l.listing_id}] "${l.title}" - ${formatPrice(l)} - ${l.description.slice(0, 150)}`;
}

function postSummary(p: PagePost): string {
  return `[${p.created_time}] ${(p.message || "(no text)").slice(0, 150)}`;
}

/**
 * Use AI to pick the best listing to post next, considering
 * what's already been posted to Facebook and what's available on Etsy.
 */
export async function pickBestListing(
  etsyListings: EtsyListing[],
  recentFbPosts: PagePost[]
): Promise<{ listingId: number; reasoning: string }> {
  const etsySummaries = etsyListings.map(listingSummary).join("\n");
  const fbSummaries = recentFbPosts.map(postSummary).join("\n");

  const prompt = `You are a social media strategist for Drakey3DPrints, a 3D printing shop that sells architectural skyscraper models.

Here are the AVAILABLE Etsy listings that could be posted:
${etsySummaries}

Here are the RECENT Facebook posts already made:
${fbSummaries || "(No recent posts)"}

Pick the BEST listing to post next. Consider:
- Don't pick something too similar to recent posts (avoid posting the same building/city twice in a row)
- Prefer variety in price range, location (different cities/countries), and style
- Higher-priced items are good to feature as they're more impressive
- Newer listings that haven't had exposure yet are good picks
- Consider what would get the most engagement

Respond with ONLY a JSON object (no markdown):
{"listingId": <number>, "reasoning": "<brief explanation>"}`;

  const response = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  const text = block.text.trim().replace(/^```json\s*/, "").replace(/\s*```$/, "");
  return JSON.parse(text);
}

/** Generate an engaging Facebook post caption from an Etsy listing */
export async function generatePostCaption(
  listing: EtsyListing
): Promise<string> {
  const tone = await getToneExamples();
  const toneBlock = tone.map((t, i) => `Example ${i + 1}: "${t}"`).join("\n\n");
  const sevenDaysAgo = Date.now() / 1000 - 7 * 24 * 60 * 60;
  const isNew = listing.creation_timestamp > sevenDaysAgo;

  const prompt = `You are writing a Facebook post for Drakey3DPrints, a 3D printing shop.

Here are REAL examples of the shop owner's writing style. Match this tone exactly — conversational, knowledgeable, enthusiastic but not salesy:

${toneBlock}

Now write a post for this product. Rules:
- Sound like the examples above — first person, casual, genuine
- Mention what makes this building/model interesting (architecture facts, real-world details)
- Do NOT include the price (Etsy handles that)
- Do NOT include any URLs or links in the text — the Etsy link is shared separately as the post link
- End with a short call to action like "Check it out!" or "Have a look!" — the link preview is already visible
- 2-3 short paragraphs max
- 3-5 hashtags at the end
- No markdown, no emojis unless natural
- NEVER fabricate facts or make up details about the print process, colours, materials, or anything not in the description
- Only state facts that are in the product description below
- TIMING: ${isNew ? "This was JUST listed — you may say 'just added' or 'new to the shop'" : "This is NOT a new listing — do NOT say 'just added', 'just listed', 'new', etc."}

Product: ${listing.title}
Description: ${listing.description}
Etsy URL: ${listing.url}

Write the post:`;

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  let caption = block.text.trim();

  // Strip any URLs the AI may have included — link goes in comments only
  caption = caption.replace(/https?:\/\/\S+/g, "").replace(/\n{3,}/g, "\n\n").trim();

  return caption;
}

/** Generate shorter ad copy — same tone, punchier */
export async function generateAdCopy(
  listing: EtsyListing
): Promise<string> {
  const tone = await getToneExamples();
  const toneBlock = tone.slice(0, 5).map((t, i) => `Example ${i + 1}: "${t}"`).join("\n\n");

  const prompt = `You are writing a short Facebook ad for Drakey3DPrints.

Shop owner's voice (match this tone):
${toneBlock}

Write a SHORT ad for this product. Rules:
- Same voice as above — casual, genuine, first person
- 1-2 short paragraphs only (this is an ad, keep it punchy)
- Lead with what makes it special
- Do NOT include the price
- Clear call to action ("Shop now", "Grab yours", etc.)
- No markdown, no hashtags, no emojis
- NEVER fabricate facts — only state things from the description below

Product: ${listing.title}
Description: ${listing.description}

Write the ad:`;

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 250,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return block.text.trim();
}
