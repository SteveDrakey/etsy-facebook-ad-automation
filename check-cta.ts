import "dotenv/config";
const token = process.env.FB_PAGE_ACCESS_TOKEN;

// Our Burj Khalifa ad
const res = await fetch(`https://graph.facebook.com/v25.0/52504108604782?fields=creative{id,call_to_action_type,object_story_id}&access_token=${token}`);
const ad = await res.json() as any;
console.log("Our ad CTA:", ad.creative?.call_to_action_type);

// Also check the creative directly
const cRes = await fetch(`https://graph.facebook.com/v25.0/884329024601303?fields=call_to_action_type,call_to_action&access_token=${token}`);
const c = await cRes.json() as any;
console.log("Creative CTA type:", c.call_to_action_type);
console.log("Creative CTA:", JSON.stringify(c.call_to_action));
