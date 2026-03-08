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

// ─── Page Posting ────────────────────────────────────────────

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

const CAMPAIGN_NAME = "Drakey3DPrints Boosts";

/**
 * Get or create the persistent campaign.
 * Uses OUTCOME_TRAFFIC (no pixel needed) with POST_ENGAGEMENT optimisation.
 */
async function getOrCreateCampaign(): Promise<string> {
  const accountId = config.facebook.adAccountId();

  const searchData = await fbGraphGet(
    `${accountId}/campaigns?fields=id,name,status&filtering=[{"field":"name","operator":"CONTAIN","value":"${CAMPAIGN_NAME}"}]`
  );
  const existing = searchData.data?.find(
    (c: any) => c.name === CAMPAIGN_NAME && c.status !== "DELETED"
  );

  if (existing) return existing.id;

  const account = new AdAccount(accountId);
  const campaign = await account.createCampaign([], {
    [Campaign.Fields.name]: CAMPAIGN_NAME,
    [Campaign.Fields.objective]: "OUTCOME_TRAFFIC",
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
 * Promote an existing page post as a Facebook ad with SHOP_NOW CTA.
 * Uses object_story_spec (dark post) because object_story_id does not
 * support CTA buttons on Facebook page posts per the API docs.
 * Reads the original post's image + message, uploads the image as a
 * permanent hash, and creates a link-type creative with SHOP_NOW.
 */
export async function promotePost(
  postId: string,
  etsyUrl: string,
  adCopy: string,
  budgetPence = AD_BUDGET_PENCE,
  durationDays = AD_DURATION_DAYS,
  fallbackImageUrl?: string
): Promise<PromoteResult> {
  init();
  const accountId = config.facebook.adAccountId();
  const pageId = config.facebook.pageId();
  const account = new AdAccount(accountId);

  const now = new Date();
  const end = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const dateSuffix = now.toISOString().slice(0, 10);

  // 1. Get or create persistent campaign
  const campaignId = await getOrCreateCampaign();
  console.log(`    Using campaign: ${campaignId}`);

  // 2. Create Ad Set — matches Facebook's own boost settings
  const adSet = await account.createAdSet([], {
    [AdSet.Fields.name]: `Boost ${dateSuffix} - £${(budgetPence / 100).toFixed(2)} - ${durationDays}d`,
    [AdSet.Fields.campaign_id]: campaignId,
    [AdSet.Fields.lifetime_budget]: String(budgetPence),
    [AdSet.Fields.start_time]: now.toISOString(),
    [AdSet.Fields.end_time]: end.toISOString(),
    [AdSet.Fields.optimization_goal]: "LANDING_PAGE_VIEWS",
    [AdSet.Fields.billing_event]: "IMPRESSIONS",
    [AdSet.Fields.status]: "ACTIVE",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    destination_type: "WEBSITE",
    promoted_object: { page_id: pageId },
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
      targeting_automation: {
        advantage_audience: 1,
      },
    },
  });
  if (!adSet?._data?.id) {
    throw new Error(`Failed to create ad set: ${JSON.stringify(adSet?._data)}`);
  }
  const adSetId = adSet._data.id;
  console.log(`    Created ad set: ${adSetId}`);

  // 3. Get post image, upload to ad account, create creative with SHOP_NOW
  const postData = await fbGraphGet(`${postId}?fields=full_picture,message`);
  const imageUrl = fallbackImageUrl || postData.full_picture;
  if (!imageUrl) {
    throw new Error(`No image found for post ${postId}`);
  }
  console.log(`    Image: ${imageUrl.substring(0, 80)}...`);

  // Upload image to ad account for permanent hash
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error(`Failed to download image: ${imageRes.status}`);
  const imageBase64 = Buffer.from(await imageRes.arrayBuffer()).toString("base64");
  const adImage = await account.createAdImage([], { bytes: imageBase64 });
  const imageHash = (Object.values(adImage._data.images)[0] as any)?.hash;
  if (!imageHash) throw new Error(`No image hash returned`);
  console.log(`    Image hash: ${imageHash}`);

  // Use ad copy if provided, otherwise use original post message
  const message = adCopy || postData.message;

  const creative = await account.createAdCreative([], {
    [AdCreative.Fields.name]: `Boost ${dateSuffix}`,
    object_story_spec: {
      page_id: pageId,
      link_data: {
        image_hash: imageHash,
        link: etsyUrl,
        message,
        name: "Shop on Etsy",
        call_to_action: { type: "SHOP_NOW", value: { link: etsyUrl } },
      },
    },
  });
  if (!creative?._data?.id) {
    throw new Error(`Failed to create creative: ${JSON.stringify(creative?._data)}`);
  }
  console.log(`    Created creative: ${creative._data.id} (SHOP_NOW -> ${etsyUrl})`);

  // 4. Create Ad
  const ad = await account.createAd([], {
    [Ad.Fields.name]: `Boost ${dateSuffix}`,
    [Ad.Fields.adset_id]: adSetId,
    [Ad.Fields.creative]: { creative_id: creative._data.id },
    [Ad.Fields.status]: "ACTIVE",
  });
  if (!ad?._data?.id) {
    throw new Error(`Failed to create ad: ${JSON.stringify(ad?._data)}`);
  }
  console.log(`    Created ad: ${ad._data.id}`);

  return { campaignId, adSetId, adId: ad._data.id };
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
