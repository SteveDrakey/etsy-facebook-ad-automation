import "dotenv/config";

const API_KEY = `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`;
const MY_SHOP = 56796619;

const searches = [
  "3d printed skyscraper model",
  "3d printed architectural model",
  "3d printed building replica",
  "3d printed landmark model",
  "3d printed city model",
  "3d printed tower model",
  "miniature skyscraper",
  "scale model building",
  "burj khalifa model",
  "empire state building model",
  "3d printed dubai",
  "architectural desk decor",
];

async function search(query: string) {
  const url = `https://api.etsy.com/v3/application/listings/active?keywords=${encodeURIComponent(query)}&limit=10&sort_on=score`;
  const res = await fetch(url, { headers: { "x-api-key": API_KEY } });
  if (!res.ok) return [];
  const data = (await res.json()) as any;
  return data.results.filter((l: any) => l.shop_id !== MY_SHOP);
}

const allTags = new Map<string, number>(); // tag -> count across competitors
const competitors: Array<{ title: string; tags: string[] }> = [];

for (const q of searches) {
  const results = await search(q);
  for (const l of results.slice(0, 5)) {
    // Skip STL files, wall art, non-physical
    const t = l.title.toLowerCase();
    if (t.includes("stl") || t.includes("file") || t.includes("wall art") || t.includes("canvas") || t.includes("poster")) continue;

    competitors.push({ title: l.title.slice(0, 60), tags: l.tags });
    for (const tag of l.tags) {
      const norm = tag.toLowerCase().trim();
      allTags.set(norm, (allTags.get(norm) || 0) + 1);
    }
  }
  await new Promise((r) => setTimeout(r, 220));
}

console.log(`Analysed ${competitors.length} competitor listings\n`);

// Show top competitor tags by frequency
const sorted = [...allTags.entries()].sort((a, b) => b[1] - a[1]);
console.log("TOP COMPETITOR TAGS (by frequency across listings):");
console.log("=".repeat(60));
for (const [tag, count] of sorted.slice(0, 50)) {
  console.log(`  ${count.toString().padStart(3)}x  ${tag}`);
}

// Show some competitor listings with their full tags
console.log("\n\nSAMPLE COMPETITOR LISTINGS:");
console.log("=".repeat(60));
const seen = new Set<string>();
for (const c of competitors) {
  if (seen.has(c.title)) continue;
  seen.add(c.title);
  if (seen.size > 15) break;
  console.log(`\n${c.title}`);
  console.log(`  ${c.tags.join(", ")}`);
}
