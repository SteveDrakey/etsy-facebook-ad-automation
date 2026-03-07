import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, "../../data/state.json");

export interface PostedEntry {
  listingId: number;
  postId: string;
  etsyUrl: string;
  date: string;
}

export interface PromotedEntry {
  postId: string;
  campaignId: string;
  adSetId: string;
  adId: string;
  date: string;
}

export interface State {
  posted: PostedEntry[];
  promoted: PromotedEntry[];
}

function emptyState(): State {
  return { posted: [], promoted: [] };
}

export async function loadState(): Promise<State> {
  try {
    const raw = await readFile(STATE_PATH, "utf-8");
    return JSON.parse(raw) as State;
  } catch {
    return emptyState();
  }
}

export async function saveState(state: State): Promise<void> {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

/** Get set of listing IDs that have already been posted */
export function getPostedListingIds(state: State): Set<number> {
  return new Set(state.posted.map((p) => p.listingId));
}

/** Get posts that haven't been promoted yet */
export function getUnpromotedPosts(state: State): PostedEntry[] {
  const promotedPostIds = new Set(state.promoted.map((p) => p.postId));
  return state.posted.filter((p) => !promotedPostIds.has(p.postId));
}

/** Record that a listing was posted to Facebook */
export function markAsPosted(
  state: State,
  listingId: number,
  postId: string,
  etsyUrl: string
): void {
  state.posted.push({
    listingId,
    postId,
    etsyUrl,
    date: new Date().toISOString(),
  });
}

/** Record that a post was promoted as an ad */
export function markAsPromoted(
  state: State,
  postId: string,
  ids: { campaignId: string; adSetId: string; adId: string }
): void {
  state.promoted.push({
    postId,
    ...ids,
    date: new Date().toISOString(),
  });
}
