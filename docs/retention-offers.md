# Retention offer pricing

Added November 5, 2026 to the Apple Subscriptions page. Open Retention offer pricing, choose a subscription and discount, then preview or export.

The preview reads active local subscription prices and the official price-point catalogue in batches of 20 territories. It chooses the closest paid tier below the existing local price. Missing tiers and deviations greater than five percentage points are flagged. It never writes regular subscription prices or submits a message. The export records the subscription, timestamp, requested discount and selected territory/price-point IDs.

## Remaining integration blocker

Apple's official App Store Connect OpenAPI 4.6 (downloaded November 5) contains POST /v1/retentionOffers, GET /v1/subscriptions/{id}/retentionOffers and GET /v1/retentionOffers/{id}/prices. RetentionOfferCreateRequest links inline retentionOfferPrices, but RetentionOfferPriceInlineCreate describes only type and id. It provides no documented attributes or relationships to select territory/subscriptionPricePoint. Do not guess a production payload or substitute subscriptionPrices writes: those change regular prices.

Confirm Apple's inline pricing format before implementing creation. Then add pre-write backups, reviewed preview enforcement, duplicate offer-ID recovery, paginated price readback and subscription-message association verification. Review submission must remain separate from draft creation. Current implementation is planning/export only, not end-to-end offer automation.

Google Play cancellation retention is a different flow. No Google write adapter or parity is claimed by this Apple-specific planner.

Sources:
- https://developer.apple.com/sample-code/app-store-connect/app-store-connect-openapi-specification.zip
- https://developer.apple.com/help/app-store-connect/manage-subscriptions/configure-retention-messages

Validation: targeted retention-pricing tests, TypeScript, ESLint and diff whitespace checks. No real store writes used for validation.
