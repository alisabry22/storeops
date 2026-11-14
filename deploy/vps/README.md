# VPS staging assessment

Staged source: `c06032b` plus the local Dockerfile changes. The current image
`storeops-staging:cloud-auth` uses Cloud mode, the canonical production URL, and
production public Clerk/checkout settings. The Dockerfile carries the selected
edition into the runner and accepts public-only build configuration through the
optional `storeops_public_env` BuildKit secret mount.
The app has no database, AI, or store credentials. The owner
subsequently supplied production Clerk and signing secrets; these are loaded
from a mode-0600 `.env.staging` on the VPS, outside the image and source control.

The source is at `/srv/storeops-staging/source`; Compose is at
`/srv/storeops-staging/compose.yaml`. The container has a 1.5 GiB memory limit,
1.5 CPU limit, automatic restart, bounded logs, and an internal Docker network.
It cannot reach the public internet. This intentionally prevents live store
or billing operations during browser QA.

Docker's internal network does not publish the requested container port on
this host. A separate private Nginx process uses
`/srv/storeops-staging/nginx.conf` to forward `127.0.0.1:13100` to the container
at `172.21.0.2:3000`. This Nginx process is temporary, not a boot service. If
the container is recreated, check its address and update the upstream before
restarting the private Nginx process. Production Nginx was not changed.

To preview from the Mac:

```sh
ssh -N -L 3100:127.0.0.1:13100 contabo-gateway
```

Open `http://localhost:3100`. The existing shell session may already hold this
tunnel; avoid starting a duplicate while it is active.

## Verification

- 77 source tests and lint passed.
- Cloud image build and TypeScript compilation passed on Linux.
- Apple browser fixture: 26 pricing checks and 11 failure checks passed.
- Google browser fixture: 38 pricing, backup, failure, and verification checks passed.
- Navigation fixtures: 46 Apple/shared and 23 Google checks passed across
  desktop and mobile widths (144 browser checks total).
- Browser fixtures intercept API traffic and use synthetic keys and a synthetic
  client-side paid-license state. They do not validate real customer entitlement.
- Actual server rejects unauthorized Apple and Google write requests with 403.
- Anonymous account endpoint returns 401. With the supplied signing secret,
  the webhook accepts a correctly signed probe with no customer identity
  (200, skipped) and rejects an invalid signature (401). No entitlement was
  written; the container still has no database credentials or internet access.
- 100 page requests with concurrency four returned successfully. This is a
  smoke test, not a capacity benchmark for authenticated workloads.
- Container idle memory observed around 65 MiB; measure real integrations and
  production traffic before selecting final resource limits.

## Network investigation

The October 18 boot completed the network wait successfully. After a
`systemd-networkd` restart on October 21, the wait service timed out. `eth0`
currently has its static IPv4 and IPv6 addresses, both default routes, working
traffic, and an online/routable state. However, its administrative state remains
`configuring`: networkd reports the IPv4 default route as
`requesting,configured` and IPv6 as `configuring,configured`. A three-second
read-only wait probe reproduces the timeout.

Resolved November 2: backed up netplan and route/address state under
`/root/storeops-network-backup`, added `KeepConfiguration=static` in
`/etc/systemd/network/10-netplan-eth0.network.d/50-preserve-static.conf`,
restarted networkd, and reconfigured eth0 from its unchanged static settings.
The interface now reports `routable (configured)`, both default routes remain,
and the online-wait probe succeeds. The wait-online service was restarted and
is active; no failed systemd units remain. Fresh SSH, Vocash and Baskoota HTTPS,
and running containers were verified afterward. No reboot was performed;
reboot recovery is not established by these checks.

## Before production cutover

Follow-up: the owner authorized existing production credentials. Read-only
Neon `SELECT 1` and Clerk API authentication succeeded locally and from a
one-off VPS container. The temporary VPS credential file was removed afterward;
the staged app remains isolated. Local Clerk keys were replaced with the
owner-supplied production pair. Vercel contains
the missing webhook and license-proof secrets, but marks saved secrets as
write-only (no reveal or copy). The owner supplied both signing values afterward.
An independent license-proof secret was subsequently generated and installed
locally and on VPS staging; the launch check passes. The owner reports updating
Vercel and redeploying, but the live probe now passes the proof gate (Apple rejects the synthetic invalid
store token with 401). The supposedly unsupported probe path was permitted by
the proxy policy and did reach Apple; no valid credentials or real store
changes were involved. Do not reuse this probe as a network-free check.
Google sign-in on the live Vercel origin succeeded for the owner-selected
account, loaded its existing Pro plan, and persisted after reload. This verifies
production sign-in, not a complete browser session against the isolated VPS.
The supplied production Clerk key authenticates from
the VPS and matches the StoreOps domain. The running app returns a signed-out
response and 401 for anonymous account requests; unauthorized Apple/Google
writes return 403. This does not constitute a full signed-in browser test.
No Vercel variables were changed.

Use read-only checks against existing production services; perform entitlement
mutation tests only against synthetic fixtures or isolated test services.
Preserve the existing production hostname and secrets.
Use the public-only build configuration mount for Clerk/checkout values;
never put private Clerk or signing keys in it.

Prepare production Nginx, trusted HTTPS, renewal, health monitoring, deployments,
and rollback. Preserve Cloud's server-side entitlement gate and verify both
stores without real writes. StoreOps production DNS remains on Vercel.

## Production candidate (November 2)

`/srv/storeops-production/compose.yaml` runs the Cloud image as
`storeops-production-candidate`, on loopback `127.0.0.1:13200`. Unlike the
isolated fixture instance, this container has outbound access and the existing
production runtime configuration in a mode-0600 `.env.production`. It has a
2 GiB memory limit, two CPU limit, automatic restart, and bounded logs.

Main Nginx now has the StoreOps virtual host in
`/etc/nginx/sites-available/storeops`, enabled through `sites-enabled`.
A Let's Encrypt certificate covers apex and www, expiring January 31, 2027.
The initial issuance used DNS validation; automatic webroot renewal must be
configured and dry-run verified after DNS cutover. `certbot.timer` is active.
HTTPS with `curl --resolve` validates normally and returns 200; anonymous
account access returns 401, unauthorized Apple and Google writes return 403,
and invalid webhook signatures return 401. No real store writes were used.

Original Cloudflare website records for rollback (DNS only, TTL Auto):

- CNAME `storeops.dev` → `56ef1fcdbce8e66f.vercel-dns-016.com`
- CNAME `www` → `56ef1fcdbce8e66f.vercel-dns-016.com`

Preserve all Clerk, checkout, mail, verification and other DNS records.
Keep the Vercel project and configuration available for rollback.

### Deployments

From a clean checkout on your Mac, after pushing the commit to GitHub:

```sh
npm run deploy                     # deploy the checked-out commit
npm run deploy -- --ref <commit>   # deploy another pushed commit
npm run deploy -- --status         # running image, recent deploys, health checks
npm run deploy -- --rollback       # restore the previous image
```

`scripts/deploy-vps.sh` refuses uncommitted or unpushed work, runs typecheck,
lint and tests, then uploads and runs `deploy/vps/remote-deploy.sh` over SSH
(`STOREOPS_DEPLOY_HOST`, default `contabo-gateway`). On the VPS it:

1. Fetches the commit into the dedicated checkout `/srv/storeops-production/repo`
   (only changed files transfer) and cleans it.
2. Builds `storeops-production:<short-sha>` with Cloud edition, the canonical
   site URL, and only `NEXT_PUBLIC_` values from `.env.production` through the
   `storeops_public_env` BuildKit mount. Private keys never enter the image.
   A failed build leaves production untouched (log: `build-<sha>.log`).
3. Saves `compose.yaml.prev`, switches the image, and health-checks: pages 200,
   anonymous account 401, Apple and Google write gates 403, bad webhook
   signature 401, demo video 206.
4. Restores the previous image automatically if any check fails, and appends
   every outcome to `deployments.log`. The newest three release images are
   kept, plus the running and rollback images.

A single-container switch briefly interrupts requests. No CI trigger exists;
deploys are always run by hand.

### Large media

The landing-page demo video is not in the repo or the image. Nginx serves
`/storeops-demo-web.mp4` from `/srv/storeops-production/media/` (see
`nginx.production.conf`). To replace it, copy the new file there; for local
development keep a copy in `public/` (ignored by git).

## Cutover accepted — November 2, 2026

The real-hostname browser test connected to `173.212.233.72:443` with normal
certificate verification. Google sign-in completed for the owner-selected
existing account; `/api/me` returned 200 and the existing Pro plan persisted
through reload. Authenticated snapshot GETs returned 200 and valid arrays.
The first unparameterized snapshot probe correctly returned 400; adding the
required `appId` and `scope` resolved it. No snapshot or store writes occurred.

Cloudflare apex is now A `173.212.233.72`; www is CNAME `storeops.dev`, both
DNS-only, Auto TTL. Authoritative DNS, Cloudflare and Google public resolvers,
public curl, and a second browser without host overrides confirmed the VPS.
Apex HTTPS and HTTP redirect to canonical `https://www.storeops.dev/`.

Certificate issuance was replaced with webroot authentication after cutover.
`certbot renew --cert-name storeops.dev --dry-run --no-random-sleep-on-renew`
succeeded. Renewal config uses `/var/lib/letsencrypt` and a reload hook for
Nginx; the system Certbot timer is active. No manual DNS validation is needed
for normal future renewals while DNS and port 80 remain correctly configured.
Vercel has been retained for rollback. No server reboot or actual store/billing
transaction was part of acceptance.
