import bizSdk from "facebook-nodejs-business-sdk";
import { config, AD_BUDGET_PENCE, AD_DURATION_DAYS } from "../config.js";

const {
  FacebookAdsApi,
  Page,
  AdAccount,
  Campaign,
  AdSet,
  AdCreative,
  Ad,
} = bizSdk;

let initialized = false;

function init() {
  if (initialized) return;
  FacebookAdsApi.init(config.facebook.pageAccessToken());
  initialized = true;
}

/** Checked Graph API GET — throws on HTTP errors and API error responses */
async function fbGraphGet(path: string): Promise<any> {
  const token = config.facebook.pageAccessToken();
  const separator = path.includes("?") ? "&" : "?";
  const url = `https://graph.facebook.com/v25.0/${path}${separator}access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Facebook Graph API ${res.status}: ${body}`);
  }
  const data = await res.json();
  if ((data as any).error) {
    throw new Error(`Facebook Graph API error: ${(data as any).error.message}`);
  }
  return data;
}

/** Checked Graph API POST — throws on HTTP errors and API error responses */
async function fbGraphPost(path: string, body: Record<string, string>): Promise<any> {
  const token = config.facebook.pageAccessToken();
  const url = `https://graph.facebook.com/v25.0/${path}`;
  const params = new URLSearchParams({ ...body, access_token: token });
  const res = await fetch(url, { method: "POST", body: params });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Facebook Graph API POST ${res.status}: ${text}`);
  }
  const data = await res.json();
  if ((data as any).error) {
    throw new Error(`Facebook Graph API error: ${(data as any).error.message}`);
  }
  return data;
}

// ─── Page Posting ────────────────────────────────────────────

/**
 * Share a link on the Facebook Page (like manually sharing an Etsy URL).
 * Facebook generates the preview card from the page's Open Graph data.
 */
export async function shareLink(
  link: string,
  message: string
): Promise<{ id: string }> {
  const pageId = config.facebook.pageId();
  const data = await fbGraphPost(`${pageId}/feed`, { link, message });
  return { id: data.id };
}

export interface PhotoPostResult {
  id: string;
  post_id: string;
}

/**
 * Post a single photo to the Facebook Page.
 * Uses the image URL directly (Etsy URLs are public).
 */
export async function postPhotoToPage(
  imageUrl: string,
  caption: string
): Promise<PhotoPostResult> {
  init();
  const pageId = config.facebook.pageId();
  const page = new Page(pageId);
  const result = await page.createPhoto([], {
    url: imageUrl,
    message: caption,
    published: true,
  });
  return result._data as PhotoPostResult;
}

/**
 * Post multiple photos as a single Page post.
 * First uploads each photo as unpublished, then creates a feed post
 * attaching all of them.
 */
export async function postMultiplePhotos(
  imageUrls: string[],
  message: string
): Promise<{ id: string }> {
  init();
  const pageId = config.facebook.pageId();
  const page = new Page(pageId);

  // Upload each photo as unpublished
  const photoIds: string[] = [];
  for (const url of imageUrls) {
    const result = await page.createPhoto([], {
      url,
      published: false,
    });
    photoIds.push(result._data.id);
  }

  // Create a feed post with all photos attached
  const attachedMedia = photoIds.map((id) => ({ media_fbid: id }));
  const post = await page.createFeed([], {
    message,
    attached_media: attachedMedia,
    published: true,
  });

  return { id: post._data.id };
}

// ─── Ads / Promotion ─────────────────────────────────────────

export interface PromoteResult {
  campaignId: string;
  adSetId: string;
  adId: string;
}

const BOOST_CAMPAIGN_NAME = "Drakey3DPrints Boosts";

/**
 * Get or create the persistent boost campaign.
 * Uses OUTCOME_ENGAGEMENT objective which is required for boosted posts.
 * This is separate from the old "Drakey3DPrints Ads" campaign which used
 * OUTCOME_TRAFFIC and may have caused zero-delivery issues.
 */
async function getOrCreateCampaign(): Promise<string> {
  const accountId = config.facebook.adAccountId();

  // Check for existing boost campaign
  const searchData = await fbGraphGet(
    `${accountId}/campaigns?fields=id,name,status&filtering=[{"field":"name","operator":"CONTAIN","value":"Drakey3DPrints Boosts"}]`
  );
  const existing = searchData.data?.find(
    (c: any) => c.name === BOOST_CAMPAIGN_NAME && c.status !== "DELETED"
  );

  if (existing) return existing.id;

  // Create new boost campaign with OUTCOME_ENGAGEMENT
  const account = new AdAccount(accountId);
  const campaign = await account.createCampaign([], {
    [Campaign.Fields.name]: BOOST_CAMPAIGN_NAME,
    [Campaign.Fields.objective]: "OUTCOME_ENGAGEMENT",
    [Campaign.Fields.status]: "ACTIVE",
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
  });
  if (!campaign?._data?.id) {
    throw new Error(`Failed to create campaign: ${JSON.stringify(campaign?._data)}`);
  }
  console.log(`    Created NEW boost campaign: ${campaign._data.id}`);
  return campaign._data.id;
}

/**
 * Boost an existing page post as a Facebook ad.
 * This creates a "boosted post" that appears in Business Suite,
 * using the original post (object_story_id) instead of a new creative.
 */
export async function promotePost(
  postId: string,
  _etsyUrl: string,
  _adCopy: string,
  budgetPence = AD_BUDGET_PENCE,
  durationDays = AD_DURATION_DAYS,
  _fallbackImageUrl?: string
): Promise<PromoteResult> {
  init();
  const accountId = config.facebook.adAccountId();
  const account = new AdAccount(accountId);

  const now = new Date();
  const end = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const dateSuffix = now.toISOString().slice(0, 10);

  // 1. Get or create persistent campaign (OUTCOME_ENGAGEMENT for boosted posts)
  const campaignId = await getOrCreateCampaign();
  console.log(`    Using campaign: ${campaignId}`);

  // 2. Create Ad Set with lifetime budget
  const adSet = await account.createAdSet([], {
    [AdSet.Fields.name]: `Boost ${dateSuffix} - £${(budgetPence / 100).toFixed(2)} - ${durationDays}d`,
    [AdSet.Fields.campaign_id]: campaignId,
    [AdSet.Fields.lifetime_budget]: String(budgetPence),
    [AdSet.Fields.start_time]: now.toISOString(),
    [AdSet.Fields.end_time]: end.toISOString(),
    [AdSet.Fields.optimization_goal]: "POST_ENGAGEMENT",
    [AdSet.Fields.billing_event]: "IMPRESSIONS",
    [AdSet.Fields.status]: "ACTIVE",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    [AdSet.Fields.targeting]: {
      age_min: 18,
      geo_locations: {
        countries: [
          "GB", "US", "CA", "AU",
          "DE", "FR", "IT", "ES", "NL", "BE", "AT",
          "SE", "NO", "DK", "FI", "CH",
          "IE", "PL", "PT",
          "JP",
        ],
      },
    },
  });
  if (!adSet?._data?.id) {
    throw new Error(`Failed to create ad set: ${JSON.stringify(adSet?._data)}`);
  }
  const adSetId = adSet._data.id;
  console.log(`    Created ad set: ${adSetId}`);

  // 3. Create ad creative using the existing post (object_story_id)
  //    This is what makes it a "boosted post" — it uses the original post
  //    rather than building a new creative from scratch.
  const creative = await account.createAdCreative([], {
    [AdCreative.Fields.name]: `Boost ${dateSuffix}`,
    object_story_id: postId,
  });
  if (!creative?._data?.id) {
    throw new Error(`Failed to create ad creative: ${JSON.stringify(creative?._data)}`);
  }
  console.log(`    Created boost creative: ${creative._data.id} (using post ${postId})`);

  // 4. Create Ad linked to the boost creative
  const ad = await account.createAd([], {
    [Ad.Fields.name]: `Boost ${dateSuffix}`,
    [Ad.Fields.adset_id]: adSetId,
    [Ad.Fields.creative]: { creative_id: creative._data.id },
    [Ad.Fields.status]: "ACTIVE",
  });
  if (!ad?._data?.id) {
    throw new Error(`Failed to create ad: ${JSON.stringify(ad?._data)}`);
  }
  const adId = ad._data.id;
  console.log(`    Created boosted ad: ${adId}`);

  return { campaignId, adSetId, adId };
}

// ─── Comments ─────────────────────────────────────────────────

/** Add a comment on a page post (used to put the Etsy link in comments) */
export async function commentOnPost(postId: string, message: string): Promise<string> {
  const data = await fbGraphPost(`${postId}/comments`, { message });
  return data.id;
}

// ─── Page Reading ─────────────────────────────────────────────

export interface PagePost {
  id: string;
  message: string;
  created_time: string;
  full_picture?: string;
}

/** Fetch recent published posts from the page (uses Graph API directly) */
export async function getPagePosts(limit = 25): Promise<PagePost[]> {
  const pageId = config.facebook.pageId();
  const data = await fbGraphGet(
    `${pageId}/published_posts?fields=id,message,created_time,full_picture&limit=${limit}`
  );
  return data.data as PagePost[];
}

// ─── Test helpers ─────────────────────────────────────────────

/** Quick test: fetch page name to verify token works */
export async function getPageName(): Promise<string> {
  init();
  const pageId = config.facebook.pageId();
  const page = new Page(pageId);
  const result = await page.get([Page.Fields.name]);
  return result._data.name;
}

/** Quick test: verify ad account access */
export async function getAdAccountName(): Promise<string> {
  init();
  const accountId = config.facebook.adAccountId();
  const account = new AdAccount(accountId);
  const result = await account.get([AdAccount.Fields.name]);
  return result._data.name;
}
