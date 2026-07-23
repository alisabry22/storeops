# Self-hosting StoreOps Community Edition

The Community Edition runs without Clerk, a database, or Lemon Squeezy. Store
credentials and snapshots stay in the browser profile using the deployment.

## Docker Compose

```bash
git clone https://github.com/alisabry22/storeops.git
cd storeops
docker compose up --build -d
```

Open `http://localhost:3000`. To bind another host port:

```bash
STOREOPS_PORT=8080 docker compose up --build -d
```

For a public deployment, set the canonical HTTPS URL at build time:

```bash
STOREOPS_PUBLIC_URL=https://storeops.example.com docker compose up --build -d
```

`NEXT_PUBLIC_STOREOPS_EDITION` is embedded during `next build`; changing it on
an already-built image will not change editions.

## Node.js

```bash
npm ci
cp community.env.example .env.local
npm run build
npm start
```

Node.js 22 or newer is required.

## Optional AI assistant

Set `GEMINI_API_KEY` to enable natural-language policy configuration. The AI
assistant selects a deterministic strategy and movement cap; it never generates
the production country price grid. Every core pricing workflow remains usable
without an AI key.

## Production hardening

- Put a TLS-terminating reverse proxy such as Caddy or nginx in front of the app.
- Restrict network access if the deployment is only for one team.
- Keep the container, browser, and dependencies updated.
- Use separate, revocable, least-privilege Apple and Google credentials.
- Disable request-body and authorization-header logging at every proxy layer.
- Back up exported snapshots; IndexedDB is tied to the browser and origin.

## Store-provider terms

You are responsible for complying with Apple and Google agreements. Google’s
[Developer API usage instructions](https://developers.google.com/android-publisher/api_usage)
contain restrictions on third-party publishing services and credential sharing.
Self-hosting does not waive provider terms or constitute provider approval.
