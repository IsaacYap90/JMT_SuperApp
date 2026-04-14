// One-off: register the Calendly webhook subscription for JMT.
//
// Run once (or whenever the signing key gets rotated) with:
//   CALENDLY_PAT=... CALENDLY_WEBHOOK_URL=https://dashboard.jaimuaythai.com/api/webhooks/calendly \
//     node scripts/register-calendly-webhook.mjs
//
// Steps:
//   1. Resolve the current user + organization via /users/me
//   2. List existing webhook subscriptions and short-circuit if one already
//      exists for our URL
//   3. Create a new user-scope subscription on invitee.created + invitee.canceled
//   4. Print the signing_key — paste it into Vercel env as
//      CALENDLY_WEBHOOK_SIGNING_KEY (production + preview + development).
//      Calendly only shows the key once.

const API = "https://api.calendly.com";

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
  return v;
}

async function cf(path, init = {}) {
  const pat = required("CALENDLY_PAT");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    console.error(`Calendly ${res.status} ${path}:`, body);
    process.exit(1);
  }
  return body;
}

async function main() {
  const url = required("CALENDLY_WEBHOOK_URL");

  const me = await cf("/users/me");
  const userUri = me.resource.uri;
  const orgUri = me.resource.current_organization;
  console.log("User:", me.resource.name, userUri);
  console.log("Organization:", orgUri);

  // Check existing subscriptions at user scope
  const existing = await cf(
    `/webhook_subscriptions?organization=${encodeURIComponent(
      orgUri
    )}&user=${encodeURIComponent(userUri)}&scope=user`
  );
  const match = (existing.collection || []).find(
    (s) => s.callback_url === url
  );
  if (match) {
    console.log(
      `Webhook already exists for ${url}:`,
      match.uri,
      "- state:",
      match.state
    );
    console.log(
      "If you need a new signing key, delete the existing subscription via Calendly UI/API first, then re-run this script."
    );
    return;
  }

  const created = await cf("/webhook_subscriptions", {
    method: "POST",
    body: JSON.stringify({
      url,
      events: ["invitee.created", "invitee.canceled"],
      organization: orgUri,
      user: userUri,
      scope: "user",
    }),
  });

  const sub = created.resource;
  console.log("\n✅ Webhook subscription created");
  console.log("URI:        ", sub.uri);
  console.log("State:      ", sub.state);
  console.log("Events:     ", sub.events);
  console.log("Callback:   ", sub.callback_url);
  console.log("\n🔑 SIGNING KEY (only shown once — save it now):");
  console.log(sub.signing_key);
  console.log(
    "\nAdd this to Vercel env as CALENDLY_WEBHOOK_SIGNING_KEY for production + preview + development."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
