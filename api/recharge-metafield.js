// api/recharge-metafield.js
export default async function handler(req, res) {

  const { email, tier } = req.body;
  if (!email || !tier) {
    return res.status(400).json({ error: "Missing email or tier" });
  }

  const HEADERS = {
    "Content-Type": "application/json",
    "X-Recharge-Access-Token": process.env.RECHARGE_ACCESS_TOKEN,
    "X-Recharge-Version": "2021-11"
  };

  // 1. Get Recharge customer ID — by email, confirmed working
  const rechargeRes = await fetch(
    `https://api.rechargeapps.com/customers?email=${encodeURIComponent(email)}`,
    { headers: HEADERS }
  );
  const rechargeData = await rechargeRes.json();
  const rcid = rechargeData.customers?.[0]?.id;
  if (!rcid) return res.status(404).json({ error: "Recharge customer not found", rechargeData });

  // 2. Try POST to create
  const postRes = await fetch("https://api.rechargeapps.com/metafields", {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      metafield: {
        owner_resource: "customer",
        owner_id: rcid,
        namespace: "ditto",
        key: "tiers_reached",
        value_type: "json_string",
        value: JSON.stringify([tier])
      }
    })
  });

  // 3. If 422 (already exists), GET ID then PUT — flat overwrite, as you want
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
        metafield: {
          value_type: "json_string",
          value: JSON.stringify([tier])
        }
      })
    });
  }

  return res.status(200).json({ ok: true });
}
