# Open-source launch checklist

Do not change repository visibility until every item below is complete. Making a
repository public exposes its reachable Git history, not only the latest files.

## Before publication

- [ ] Rotate the Lemon Squeezy webhook secret previously shown in a screenshot.
- [ ] Confirm all events in [Cloud billing operations](CLOUD_BILLING.md) are
      enabled and complete the yearly/lifetime acceptance test.
- [ ] Rotate any store, Clerk, database, AI, or billing credential ever pasted
      into an issue, chat, terminal recording, commit, or screenshot.
- [ ] Run a dedicated history scanner such as Gitleaks or TruffleHog locally.
- [ ] Inspect every tracked binary and demo asset for customer or account data.
- [ ] Confirm `npm test`, `npm run lint`, and both edition builds pass.
- [ ] Obtain appropriate guidance about Apple and Google API terms for the
      hosted product.
- [ ] Review AGPL-3.0 obligations and the business model with counsel if needed.

## GitHub settings

GitHub Free supports unlimited public repositories and collaborators; upgrading
the personal account is optional.

After making the repository public:

- Enable private vulnerability reporting and Dependabot alerts.
- Protect `main`; require the CI check and at least one review when collaborators
  are added.
- Disable force pushes and branch deletion on `main`.
- Enable Discussions for questions and self-hosting help.
- Add repository topics: `app-store-connect`, `google-play`, `pricing`,
  `release-automation`, `nextjs`, `typescript`, and `self-hosted`.
- Add the website URL and a concise repository description.
- Pin the repository on the maintainer profile.

## First release

- Tag the reviewed commit as `v0.1.0`.
- Publish release notes that clearly label the project as early-stage.
- Include Docker Compose and Node.js quick-start instructions.
- List known limitations and provider-policy responsibilities.
- Open a small set of well-scoped `good first issue` tasks.

## Commercial launch

- Keep StoreOps Cloud clearly identified as the hosted service.
- Sell deployment-free convenience, synchronized recovery, maintenance, and
  support—not access to otherwise advertised open-source core workflows.
- Preserve current Yearly and Lifetime customer entitlements.
- Publish an honest Community-vs-Cloud comparison and keep it current.
