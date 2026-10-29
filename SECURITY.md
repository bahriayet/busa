# Security Policy

## Supported versions

The `main` branch is the only supported version. Deployments should track it.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Send a private report to **muhammadbahri270899@gmail.com** with:

- A short description of the issue and its impact.
- Steps to reproduce, or a proof of concept.
- The affected endpoint, page, or file.
- Your environment (browser, Node.js version) if relevant.

If GitHub private vulnerability reporting is enabled for this repository, you
may use the **Security → Report a vulnerability** flow instead.

You will get an acknowledgement when the report is reviewed. Fix timelines
depend on severity and on the maintainer's availability; this is a
single-maintainer project, not a commercial support contract.

## Scope

In scope:

- Authentication, session handling, and password reset logic.
- Role-based access control and privilege escalation.
- Order, payment, wallet, and customer-data exposure.
- Injection, SSRF, path traversal, and unsafe file upload handling.
- CSP, CORS, and other browser-side defenses.
- Secrets accidentally committed to the repository.

Out of scope:

- Denial of service through volumetric traffic.
- Issues that require a compromised device or a already-stolen password.
- Findings in third-party services (Neon, Render, Vercel, QRIS providers).
- Social engineering.

## Safe harbor

Good-faith research that avoids privacy violations, data destruction, and
service disruption is welcome. Do not access, modify, or retain other people's
data, and give the maintainer reasonable time to fix the issue before public
disclosure.
