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

  const rechargeRes = await fetch(
    `https://api.rechargeapps.com/customers?email=${encodeURIComponent(email)}`,
    { headers: HEADERS }
  );
  const rechargeData = await rechargeRes.json();
  const rcid = rechargeData.customers?.[0]?.id;
  if (!rcid) return res.status(404).json({ error: "Recharge customer not found", rechargeData });

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
  const postBody = await postRes.json();
  console.log("POST status:", postRes.status, "body:", JSON.stringify(postBody));

  if (postRes.status === 201 || postRes.status === 200) {
    return res.status(200).json({ ok: true, rcid, action: "created", result: postBody });
  }

  if (postRes.status === 422) {
    const { metafields } = await fetch(
      `https://api.rechargeapps.com/metafields?owner_resource=customer&owner_id=${rcid}`,
      { headers: HEADERS }
    ).then(r => r.json());

    const existing = metafields?.find(m => m.namespace === "ditto" && m.key === "tiers_reached");
    if (!existing) return res.status(500).json({ error: "422 but no existing metafield found", postBody });

    const currentTiers = JSON.parse(existing.value || "[]");
    if (!currentTiers.includes(tier)) currentTiers.push(tier);

    const putRes = await fetch(`https://api.rechargeapps.com/metafields/${existing.id}`, {
      method: "PUT",
      headers: HEADERS,
      body: JSON.stringify({
        owner_resource: "customer",
        owner_id: rcid,
        value_type: "json_string",
        value: JSON.stringify(currentTiers)
      })
    });
    const putBody = await putRes.json();
    console.log("PUT status:", putRes.status, "body:", JSON.stringify(putBody));

    if (putRes.status !== 200) {
      return res.status(500).json({ error: "PUT failed", putBody });
    }
    return res.status(200).json({ ok: true, rcid, action: "updated", result: putBody });
  }

  // Anything else is a real failure — surface it, don't hide it
  return res.status(500).json({ error: "POST failed with unexpected status", status: postRes.status, postBody });
}
