# StoreOps

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
Indie app developers preparing a launch or managing App Store Connect and Google Play pricing and metadata.

## Product Purpose
Help developers make and execute understandable regional pricing decisions without repeating calculations and store-console work.

## Capabilities and Constraints
- Existing deterministic Market access, Growth, Revenue, Retention, and Professional policies adjust official store baselines.
- Linked monthly and yearly subscription pricing belongs inside the existing subscriptions workspace. Developers select both products, set reference prices, and review both across countries before applying.
- User-facing features must support both App Store Connect and Google Play. Shared workflows use one interface with store-specific adapters; unavoidable store limitations must be explicit, never silently omitted.
- Linked plans support Apple subscriptions and Google Play monthly/yearly base plans. Google updates new-buyer prices only, without migrating existing subscriber cohorts.
- Prices must resolve to official store price points; previews show the resulting annual savings rather than promising an optimal price or revenue lift.
- Store mutations require explicit review, pre-write snapshots, and post-write verification. Multi-product writes are not atomic.
- Store keys remain in the browser. Community and Cloud edition boundaries remain in place.

## Brand Commitments
Preserve the existing StoreOps interface and component vocabulary while extending the subscription workflow.
The owner wants task-led screens with less text, more visual guidance, plain
language, and optional advanced controls. Key workflows must work on phones as
well as desktop.

## Open Decisions
Commercial packaging and outcome-based pricing recommendations require further validation.
