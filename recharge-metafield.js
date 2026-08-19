// api/recharge-metafield.js

export default async function handler(req, res) {
  if (req.headers["x-secret"] !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { shopify_customer_id, tier } = req.body;

  if (!shopify_customer_id || !tier) {
    return res.status(400).json({ error: "Missing shopify_customer_id or tier" });
  }

  // Strip GID prefix — Recharge needs numeric ID only
  const numericId = shopify_customer_id.replace("gid://shopify/Customer/", "");

  const HEADERS = {
    "Content-Type": "application/json",
    "X-Recharge-Access-Token": process.env.RECHARGE_ACCESS_TOKEN,
    "X-Recharge-Version": "2021-11"
  };

  // 1. Get Recharge customer ID
  const { customers } = await fetch(
    `https://api.rechargeapps.com/customers?shopify_customer_id=${numericId}`,
    { headers: HEADERS }
  ).then(r => r.json());
  const rcid = customers?.[0]?.id;

  if (!rcid) return res.status(404).json({ error: "Recharge customer not found" });

  // 2. Try POST to create
  const postRes = await fetch("https://api.rechargeapps.com/metafields", {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      owner_resource: "customer",
      owner_id: rcid,
      namespace: "ditto",
      key: "tiers_reached",
      value_type: "json_string",
      value: JSON.stringify([tier])
    })
  });

  // 3. If 422 (already exists), GET ID then PUT
  if (postRes.status === 422) {
    const { metafields } = await fetch(
      `https://api.rechargeapps.com/metafields?owner_resource=customer&owner_id=${rcid}`,
      { headers: HEADERS }
    ).then(r => r.json());
    const existing = metafields?.find(
      m => m.namespace === "ditto" && m.key === "tiers_reached"
    );

    if (!existing) return res.status(500).json({ error: "Metafield not found after 422" });

    await fetch(`https://api.rechargeapps.com/metafields/${existing.id}`, {
      method: "PUT",
      headers: HEADERS,
      body: JSON.stringify({
        owner_resource: "customer",
        owner_id: rcid,
        value_type: "json_string",
        value: JSON.stringify([tier])
      })
    });
  }

  return res.status(200).json({ ok: true });
}
