# StoreOps Cloud billing operations

This runbook applies only to StoreOps Cloud. Community builds do not initialize
Lemon Squeezy, Clerk, or the Cloud entitlement database.

## Products

| Plan | Lemon Squeezy variant | StoreOps plan |
| --- | --- | --- |
| Yearly | `1888145` | `pro` |
| Lifetime | `1892544` | `lifetime` |

The checkout URLs and variant allowlists live in the Cloud deployment
environment. Variant IDs are public identifiers; signing secrets are not.

## Production webhook

Callback URL:

```text
https://www.storeops.dev/api/webhooks/lemonsqueezy
```

Enable these events:

- `order_created`
- `order_refunded`
- `subscription_created`
- `subscription_updated`
- `subscription_expired`

`order_created` activates a lifetime purchase. Lemon Squeezy sends
`subscription_created` alongside the first yearly order. `subscription_updated`
is the lifecycle catch-all, while `subscription_expired` makes the terminal
state explicit. `order_refunded` removes refunded access.

The endpoint verifies the HMAC over the exact raw body using the
`X-Signature` header. Configure the same 6–40 character secret in Lemon
Squeezy and `LEMONSQUEEZY_WEBHOOK_SECRET` in the Cloud environment.

## Zero-downtime secret rotation

Do not replace the value in only one system; that creates a window where valid
purchases are rejected.

1. Generate a new random 40-character secret without placing it in source,
   screenshots, chat, or terminal history.
2. In the Cloud environment, set the new value as
   `LEMONSQUEEZY_WEBHOOK_SECRET` and the old value as
   `LEMONSQUEEZY_WEBHOOK_SECRET_PREVIOUS`.
3. Deploy that Cloud configuration.
4. Change the Lemon Squeezy webhook signing secret to the new value.
5. Send a test-mode or simulated event and confirm an HTTP `200` plus the
   expected entitlement.
6. Remove `LEMONSQUEEZY_WEBHOOK_SECRET_PREVIOUS` and deploy again.

The previous-secret variable exists only for this overlap window. The launch
checker warns until it is removed.

## Acceptance test

Before advertising the paid service:

1. Buy the yearly plan in Lemon Squeezy test mode using a new email.
2. Confirm the matching StoreOps account becomes `pro`.
3. Simulate cancellation and confirm access remains during the grace period.
4. Simulate expiration and confirm access returns to `free`.
5. Buy lifetime with another email and confirm the account becomes `lifetime`.
6. Simulate a lifetime refund and confirm the entitlement is removed.
7. Confirm an unrelated Lemon Squeezy variant and a bad signature are rejected.

Never test with production store credentials or a real customer account.
