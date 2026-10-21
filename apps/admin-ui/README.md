# ITAP Console (`apps/admin-ui`)

The operator console of the Identity Tracking and Access Platform, built on the buro framework
(`@burojs/*`, pinned to an exact version). Design: `tasks/ui/design.md`; framework gaps:
`tasks/ui/buro-gaps.md`.

## Commands

```bash
pnpm --filter admin-ui dev         # Vite dev server on http://127.0.0.1:5173 (needs the dev stack)
pnpm --filter admin-ui build       # tsc -b && vite build -> dist/
pnpm --filter admin-ui lint        # eslint
pnpm --filter admin-ui typecheck   # tsc -b --noEmit
pnpm --filter admin-ui test        # vitest run (never watch mode)
pnpm --filter admin-ui test:e2e    # Playwright against the running dev stack
```

The dev server proxies `/v1/graphql` to Hasura (`localhost:8080`, websockets), `/auth` to Nhost auth
(`localhost:4100`), `/storage` to Nhost storage and `/socket.io` to the backend (`localhost:3001`).

## Layout

```
index.html                pre-paint theme script (key `buro-theme`)
src/main.tsx, app.tsx     boot and root component
src/app/                  app-definition.ts (the single `use()` list), nav.ts (sections, icons),
                          pages.ts, blocks.ts, block-implementations.ts, help-page.tsx,
                          register-icons.ts (lucide icons the kit does not ship)
src/modules/<module>/     resources, module blocks and docs/<topic>.<locale>.md articles
src/i18n/                 locale registry; locales/ (common), enums/, resources/ bundles per locale
src/docs.ts               DocsConfig: article glob and the glossary (concepts)
tests/                    vitest: checkApp, docs integrity, nav icons, mount
```

## Rules

- Every user-visible text is English and declared in `texts` on its element (`texts.label`,
  `texts.doc.summary`, ...). No inline locale maps; translations are bundle files under
  `src/i18n/<namespace>/<locale>.ts`.
- Every resource documents itself (`texts.doc.summary`), and so does every field whose label does
  not carry its meaning. Glossary terms live in `src/i18n/locales/<locale>.ts` under `concepts` and
  are listed in `src/docs.ts`.
- `tests/check-app.test.ts` (`checkApp`) and `tests/docs-integrity.test.ts` must stay green.
- Data goes through `@burojs/hasura` only; the console never uses the Hasura admin secret.
