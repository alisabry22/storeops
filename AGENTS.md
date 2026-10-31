<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cross-store product contract

User-facing features must work for both App Store Connect and Google Play.
Reuse shared UI and business rules with store-specific API adapters. Test both
stores; make unavoidable platform differences explicit. Pricing changes require
reviewed previews, pre-write backups, and honest post-write verification. Never
apply real store changes as part of browser QA.
