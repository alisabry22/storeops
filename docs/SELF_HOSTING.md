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

Release tags also trigger a Community image build at
`ghcr.io/alisabry22/storeops:<release-tag>`. Once the first tagged image is
published and the package is public, replace `<release-tag>` with a published
version (for example, `v1.0.0`) and run:

```bash
STOREOPS_VERSION=v1.0.0 # Replace with an actual published release tag.
docker run -d --name storeops -p 127.0.0.1:3000:3000 "ghcr.io/alisabry22/storeops:$STOREOPS_VERSION"
```

The published image is built for localhost. Build with Compose and set
`STOREOPS_PUBLIC_URL` for a different canonical URL; changing it at runtime
cannot update the compiled public settings. Publishing a first image requires
the repository owner to make the GHCR package public in GitHub package settings.

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

Node.js 24 LTS is required; use 24.22.2 or a newer patched 24.x release.

If `.env.local` already exists, set `NEXT_PUBLIC_STOREOPS_EDITION=community`
in that file and restart the development server or rebuild for production.
The header says “Community · self-hosted” when the setting is active. Do not
reuse Cloud credentials for this setup.

## Backing up prices

Community backups are stored in the current browser and origin; they do not
sync between devices. Before applying prices, open **Price backups** in the
individual pricing view, save a named backup, and use **Download backup** to
keep a separate JSON copy. For paired plans, do this for each plan. To recover
on another browser, connect the same store and app, open the corresponding
individual pricing view, and import the file. StoreOps still saves a fresh
local snapshot immediately before each pricing write.

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
