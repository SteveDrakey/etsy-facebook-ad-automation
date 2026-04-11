import "dotenv/config";

const API_KEY = `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`;
const MY_SHOP = 56796619;

async function search(q: string) {
  const url = `https://api.etsy.com/v3/application/listings/active?keywords=${encodeURIComponent(q)}&limit=15&sort_on=score`;
  const res = await fetch(url, { headers: { "x-api-key": API_KEY } });
  if (!res.ok) { console.log("Error:", res.status, await res.text()); return; }
  const data = (await res.json()) as any;
  const results = data.results
    .filter((l: any) => l.shop_id !== MY_SHOP)
    .filter((l: any) => {
      const t = l.title.toLowerCase();
      return !t.includes("stl") && !t.includes("file") && !t.includes("digital") && !t.includes("svg") && !t.includes("poster") && !t.includes("canvas");
    });
  console.log(`${q}: ${results.length} physical results (of ${data.count} total)`);
  for (const l of results.slice(0, 8)) {
    const price = l.price.amount / l.price.divisor;
    console.log(`  ${l.price.currency_code} ${price.toFixed(2)}  ${l.title.slice(0, 90)}`);
  }
}

const queries = process.argv.slice(2);
if (queries.length === 0) {
  console.log("Usage: npx tsx src/scripts/search-etsy.ts 'query 1' 'query 2' ...");
  process.exit(1);
}

async function main() {
  for (const q of queries) {
    await search(q);
    console.log("");
  }
}

main();
