# Contributing to StoreOps

Thank you for helping developers operate their stores more safely. StoreOps
welcomes bug reports, documentation improvements, tests, design work, and code.

## Before opening an issue

- Search existing issues and discussions.
- Never include store credentials, service-account JSON, private keys, access
  tokens, license keys, customer data, or unredacted API responses.
- Use the security process in [SECURITY.md](SECURITY.md) for vulnerabilities.

## Development setup

StoreOps requires Node.js 22 or newer.

```bash
npm ci
cp community.env.example .env.local
npm run dev
```

Before submitting a pull request, run:

```bash
npm test
npm run lint
npm run build
```

Keep changes focused. Store API mutations should include a preview, explicit
confirmation, bounded inputs where applicable, post-write verification, and
tests for policy or normalization logic.

## Pull requests

1. Explain the developer problem and the chosen behavior.
2. Include tests proportional to the risk.
3. Document changes to environment variables, credentials, or store behavior.
4. Confirm that no secrets or customer data appear in the diff or history.
5. Add `Signed-off-by: Your Name <email>` to commits, certifying the
   [Developer Certificate of Origin](https://developercertificate.org/).

Use `git commit -s` to add the sign-off automatically.

## Licensing

Contributions are accepted under the repository's AGPL-3.0-only license. By
submitting a signed-off contribution, you confirm that you have the right to
submit it under that license.
