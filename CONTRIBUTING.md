# Contributing

Thanks for taking the time to improve MAHA Dewi Laundry Ops. This project is a
real production system, so changes need to be small, tested, and safe to deploy.

## Before you start

- Open an issue for anything larger than a typo or a one-line fix. It saves
  rework if the change does not fit the product.
- Never commit secrets, `.env` files, database dumps, or customer data.
- Report security issues privately as described in [SECURITY.md](SECURITY.md).

## Local setup

Requirements: Node.js 24+ and npm.

```bash
git clone https://github.com/bahriayet/busa.git
cd busa

# Frontend only
python -m http.server 4173

# Full stack
cd server
npm ci
cp .env.example .env
# edit .env
npm run dev
```

The frontend has no build step. The API runs on `http://127.0.0.1:8080` by
default and can serve the frontend when `BUSA_SERVE_STATIC=true`.

## Tests

Run these before opening a pull request:

```bash
cd server
npm run typecheck
npm test
```

The API/domain suite uses PGlite in memory, so it does not need a database
server. End-to-end tests use Playwright from the repository root:

```bash
npm install
npm run test:e2e
```

The default Playwright channel is `msedge`. On Linux, macOS, or CI, install
Chromium and select it explicitly:

```bash
npx playwright install chromium
PLAYWRIGHT_CHANNEL=chromium npm run test:e2e
```

## Code style

- TypeScript is strict. Avoid `any`; prefer a narrow type or a validated schema.
- Keep API changes typed with Zod and covered by a test.
- Keep the frontend dependency-free unless there is a strong reason to add one.
- Preserve accessibility: semantic elements, visible focus, keyboard paths,
  `aria-*` where needed, and `prefers-reduced-motion` behavior.
- Keep user-facing copy in Indonesian unless the change is developer-facing.
- Do not reformat unrelated files in the same pull request.

## Commit messages

Write a short, imperative summary. Indonesian or English is fine.

```text
Tambah validasi slot jemput
Fix duplicate audit log entry on failed login
```

## Pull request checklist

- [ ] The change is focused and described in the PR template.
- [ ] `npm run typecheck` passes in `server/`.
- [ ] `npm test` passes in `server/`.
- [ ] UI changes include a screenshot or a short recording.
- [ ] New behavior has a test, or the PR explains why a test is not practical.
- [ ] No secrets, personal data, or generated build output are included.
- [ ] Documentation is updated when behavior or configuration changes.

## License

By contributing, you agree that your contribution is licensed under the
[MIT License](LICENSE), and that you have the right to submit it.
