# Security policy

StoreOps handles high-impact publishing credentials. Please do not report a
vulnerability in a public issue.

## Reporting

Email **security@storeops.dev** with:

- the affected version or commit;
- a clear reproduction;
- the impact and affected store operation;
- any suggested mitigation.

Do not include real production credentials. Use a disposable test application
and revoke every key or token used during research.

We aim to acknowledge a report within 72 hours and provide a status update
within seven days. Please allow a reasonable remediation window before public
disclosure.

## Supported versions

Security fixes are provided for the latest release on the default branch. Older
self-hosted deployments should upgrade before requesting support.

## Credential model

- Apple and Google private keys are imported into browser WebCrypto as
  non-extractable keys and persisted in IndexedDB.
- Raw private-key material is not intentionally uploaded to StoreOps.
- Short-lived store authorization tokens traverse the same-origin proxy because
  the store APIs do not support browser CORS.
- Community operators control that proxy and are responsible for TLS, access
  controls, dependency updates, logs, and host security.

Non-extractable keys do not protect against code already executing in the page.
Treat dependency compromise, browser extensions, XSS, and a compromised host as
credential-signing risks.
