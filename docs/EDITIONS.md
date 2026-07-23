# Community and Cloud editions

StoreOps uses one source tree and two explicit build targets. This keeps the
open-source product useful while preserving a normal paid hosted service.

## Product contract

| Capability | Community | Cloud |
| --- | --- | --- |
| App Store Connect and Google Play connections | Developer-provided credentials | Developer-provided credentials |
| Read, preview, export, and deterministic policy | Included | Included |
| Maximum movement cap | Included | Paid execution |
| Local pre-write snapshots | Included | Included |
| Apply and post-write verification | Included on the operator's deployment | Paid execution |
| App Store and Google Play metadata editors | Included | Paid execution |
| Google Play “What’s new” preparation | Included | Included |
| Account and cross-device snapshot synchronization | Not included | Included |
| Managed hosting and upgrades | Not included | Included |
| Maintainer support | Community channels | Direct support |
| AI policy assistant | Optional operator Gemini key | Managed paid feature |

Community unlocks core store writes because the developer operates the
deployment. Cloud checks the signed-in account or a server-signed legacy
license proof before every store mutation.

## Build boundary

`NEXT_PUBLIC_STOREOPS_EDITION` is frozen by Next.js during `next build`.

- `community` enables Community behavior.
- `cloud`, an empty value, or an unknown value keeps Cloud behavior.

The fail-closed default is intentional. An unset or mistyped environment
variable cannot unlock the hosted paid service. `npm run launch:check` also
rejects Community mode for the StoreOps production deployment.

## Billing boundary

Community does not need or use Clerk, Postgres, Lemon Squeezy, or Vercel
Analytics. Cloud-only account, snapshot-sync, legacy-license, and webhook
routes return `404` in a Community build.

StoreOps Cloud keeps the existing purchase flow:

1. The yearly or lifetime checkout receives the signed-in email and account ID.
2. Lemon Squeezy sends a signed webhook to the Cloud deployment.
3. StoreOps verifies the signature against the exact raw request body.
4. Only configured StoreOps variant IDs can create an entitlement.
5. The entitlement ledger recomputes the customer's strongest active plan.
6. Store mutation routes verify that paid entitlement on the server.

Production configuration currently maps:

- Yearly variant `1888145` to `pro`.
- Lifetime variant `1892544` to `lifetime`.

These IDs are public product identifiers, not secrets. The webhook signing
secret, license-proof signing secret, database URL, Clerk secret, and AI key
must remain only in the Cloud deployment's secret store.

Operational setup, required webhook events, acceptance tests, and safe secret
rotation are documented in [Cloud billing operations](CLOUD_BILLING.md).

## Data boundary

Raw Apple and Google private keys are not intentionally uploaded or stored in
the Cloud database. They are imported into browser WebCrypto and persisted as
non-extractable keys in IndexedDB. Store authorization tokens traverse the
same-origin proxy because the provider APIs block browser CORS.

Community snapshots stay in that deployment origin's browser storage. Cloud
adds account-backed snapshot synchronization; it does not add store-key
storage.

## Provider-policy boundary

Open-source availability is not provider authorization. Each operator remains
responsible for Apple and Google terms, roles, credentials, and release rules.
Google's API usage instructions include restrictions on third-party publishing
services and credential sharing. StoreOps Cloud should keep Google mutation
behavior within written provider guidance; Community self-hosting does not
waive those terms.

## Maintaining the boundary

Every change that touches authentication, billing, store writes, or snapshots
must pass:

```bash
npm test
npm run lint
NEXT_PUBLIC_STOREOPS_EDITION=cloud npm run build
NEXT_PUBLIC_STOREOPS_EDITION=community npm run build
```

CI builds both editions. Pull requests must not turn Community mode into a
runtime switch or weaken Cloud's server-side write gate.
