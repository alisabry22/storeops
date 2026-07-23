# Changelog

All notable changes to StoreOps will be documented here. The project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- AGPL-3.0 Community Edition with Docker Compose and Node.js self-hosting.
- Explicit, fail-closed Community and Cloud build targets.
- Google Play localized listing metadata editor.
- Google Play “What’s new” preparation for rapid Play Console releases.
- Maximum movement caps, pre-write snapshots, and post-write verification.
- Open-source governance, contribution, security, and GitHub automation files.

### Security

- Community builds do not initialize Cloud accounts, billing, analytics, or
  database-backed snapshot synchronization.
- Cloud store mutations retain server-side paid-entitlement checks.
- Legacy Lemon Squeezy claims are restricted to configured StoreOps variants.

[Unreleased]: https://github.com/alisabry22/storeops/compare/v0.1.0...HEAD
