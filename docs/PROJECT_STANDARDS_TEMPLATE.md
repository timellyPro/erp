# Project Standards — Read This Before Writing Any Code

This file is the constitution for a new project. It is written to be copied
as `CLAUDE.md` into the root of any new repo so an AI agent (or a human)
follows the same rules from commit #1. Nothing here is optional; if a rule
can't be followed for a specific reason, write the reason down next to the
code, don't silently skip it.

## 0. Prime directives

1. **Small files.** If a file is doing two jobs, it becomes two files.
   Target: **≤150 lines per file** (hard ceiling ~250). If you're about to
   exceed it, split by responsibility, not by cutting mid-thought.
2. **One feature = one module.** Features never share internal code by
   reaching into each other's folders. Shared code goes through
   `shared/` or a published interface, never a relative import that
   crosses a feature boundary.
3. **One component = one file = one job.** No "kitchen sink" components,
   no files that render UI *and* fetch data *and* hold business logic.
4. **No quick fixes.** A TODO, a hack, an `any`, a silenced lint rule, a
   copy-pasted block — none of these get merged "to save time." Fix it
   properly or don't ship it.
5. **No unknown/unused dependencies.** Every package in `package.json`
   must be imported somewhere in source, and every import must resolve to
   a package that's actually declared (no phantom deps). Run a dependency
   audit before every merge to `main` (see §8).
6. **Secure by design, not bolted on.** Auth, tenancy, and input
   validation are enforced at the boundary (API gateway / route handler),
   never left to "the frontend won't send that."

---

## 1. Feature-Driven Architecture (FDA)

Organize by **business capability**, not by technical layer. Never have a
top-level `controllers/`, `services/`, `models/` that spans every feature —
that's layer-driven, and it's banned here.

```
src/
  features/
    <feature-name>/              # e.g. "billing", "auth", "attendance"
      api/                       # route handlers / controllers for this feature only
        <feature>.routes.ts
        <feature>.controller.ts
      domain/                    # business logic, framework-free
        <feature>.service.ts
        <feature>.rules.ts
      data/                      # persistence for this feature only
        <feature>.repository.ts
        <feature>.schema.ts      # DB schema/migration for this feature's tables
      components/                # UI, one component per file
        <Feature>List.tsx
        <Feature>Form.tsx
        <Feature>Card.tsx
      hooks/                     # feature-scoped React hooks
      types/                     # feature-scoped types/interfaces
      index.ts                   # the ONLY public export surface for this feature
  shared/
    ui/                          # generic, feature-agnostic components (Button, Modal...)
    lib/                         # generic utils (formatting, validation primitives)
    types/                       # cross-feature shared types only
  gateway/                       # API gateway layer (see §3)
  infra/                         # db client, cache client, queue client, logger
  config/                        # env schema + loaders, per-environment config
```

**Rules for this layout:**
- A feature imports from `shared/` and its own folder. It **never**
  imports another feature's internals — only that feature's `index.ts`
  public surface, and only if there's a real reason (prefer events/queues
  over direct coupling for cross-feature communication).
- `index.ts` per feature is a deliberate, minimal export list — not
  `export *`.
- If two features need the same logic, promote it to `shared/`, don't
  duplicate it, and don't reach across the boundary.
- **A feature is never one big file.** Every feature's `components/`
  folder must be split by responsibility — a list, a form, a card, a row,
  a modal, an empty state, a filter bar are each their own file. If a
  feature screen looks like one large page component with everything
  inline, that's a failed feature — break it apart before it merges.
  Concretely, for a feature named `billing` you'd expect something like:
  `BillingList.tsx`, `BillingCard.tsx`, `BillingForm.tsx`,
  `BillingFilterBar.tsx`, `BillingEmptyState.tsx` — never a single
  `Billing.tsx` doing all of it.

---

## 2. Component & module granularity

- **Split first, not later.** Every feature must ship as multiple small
  components, not one monolithic component per feature. Splitting is not
  an optimization to do "if it gets big" — it's the default shape a
  feature is written in from the first line.
- **Presentational vs. container split**: a component either renders
  markup from props, or fetches/orchestrates data — never both in one
  file.
- **One default export per file**, named after the file.
- Extract a sub-component as soon as a JSX block exceeds ~40 lines or is
  reused twice.
- Business logic (calculations, validation, transforms) lives in
  `domain/`, never inline in a component or route handler.
- Hooks that do one thing: `useX` fetches or computes exactly one thing;
  compose hooks rather than growing one hook.

---

## 3. API Gateway & Services layer

- All external traffic enters through a single **API gateway** boundary
  (a real gateway service in production; in a monolith, an equivalent
  `gateway/` layer of middleware that every request passes through).
- The gateway is responsible for: authentication, rate limiting, request
  validation (schema-based, e.g. zod), request logging/tracing, and
  routing to the right feature's handler. Business logic never lives
  here.
- Each feature exposes a **service** (`domain/*.service.ts`) as its only
  entry point for business operations. Route handlers call services;
  services call repositories; repositories talk to the DB. No layer
  skips another (a route handler never queries the DB directly).
- Services are framework-agnostic — no `req`/`res` objects inside
  `domain/`. This makes them independently testable and reusable across
  HTTP, queue consumers, or scheduled jobs.

```
Request → Gateway (auth, validate, rate-limit) → Feature Router
        → Controller (thin: parse input, call service, shape response)
        → Service (business logic, orchestration)
        → Repository (DB access, tenant-scoped queries)
        → Database
```

---

## 4. Data layer: database & cache

- **One repository per feature/table family.** Repositories are the only
  code that imports the DB client directly.
- **Schema-first**: every table has an explicit schema/migration file
  committed alongside the feature that owns it.
- **Cache is a supporting layer, not a source of truth.** Cache-aside
  pattern by default: read cache → miss → read DB → populate cache.
  Every cache write has a TTL; never cache indefinitely without an
  explicit invalidation path.
- **Multi-tenant data**: every tenant-scoped table carries a tenant/org
  ID column, indexed, and every query filters on it — enforced at the
  repository layer as a non-negotiable parameter, not an optional filter.
  Prefer defense in depth: app-level scoping *and* DB-level row security
  where the database supports it.
- Connection pooling and query timeouts are configured centrally in
  `infra/db.ts` — features never instantiate their own DB client.

---

## 5. Scalability & reliability

- **Stateless services**: no in-memory session/user state in app
  processes; session state goes in the cache/DB so any instance can serve
  any request.
- **Idempotency** on all write endpoints that can be retried (payments,
  webhooks, job handlers) — use an idempotency key.
- **Queues for anything slow or unreliable** (emails, notifications,
  PDF/report generation, webhooks out) — the request path stays fast;
  the queue consumer does the slow work.
- **Timeouts and retries with backoff** on every outbound call (DB,
  cache, third-party API) — no unbounded waits.
- **Health checks** (`/healthz`, `/readyz`) from day one so orchestration
  can detect and replace bad instances.
- **Structured logging** with request/correlation IDs threaded from the
  gateway through every layer, so a single request can be traced
  end-to-end.

---

## 6. Secure by design

- **Never trust client input for identity or scope.** Tenant ID, user ID,
  and role come from the authenticated session/token — never from a
  request body or query param, even if the client also sends them.
- **Validate every input at the boundary** with a schema (zod or
  equivalent) — reject unknown fields, not just missing ones.
- **Least privilege everywhere**: DB roles, service credentials, and API
  keys are scoped to exactly what that component needs.
- **Secrets** live in environment variables / a secrets manager, never in
  source, never in client-shipped bundles. `config/` validates required
  env vars fail fast at boot if anything's missing.
- **AuthN at the gateway, AuthZ at the service.** The gateway confirms
  *who* the caller is; each service/feature decides *what* they're
  allowed to do inside its own domain.
- **No security through obscurity fixes.** A vulnerability gets fixed at
  the root cause (proper auth check, proper query scoping), never patched
  by hiding an endpoint or relying on the UI not exposing an action.

---

## 7. Design system

- One source of truth for design tokens (colors, spacing, typography,
  radii, shadows) — a single `shared/ui/tokens.*` file or equivalent,
  consumed everywhere. No hardcoded hex values or magic pixel numbers in
  feature components.
- `shared/ui/` holds only generic, reusable, feature-agnostic components
  (Button, Input, Modal, Card, Table). A component becomes "shared" only
  after it's needed by a second feature — don't pre-abstract on day one.
- Every shared component documents its variants/props (Storybook, or at
  minimum a co-located `.md`/comment block) so features consume it
  instead of reinventing it.
- Consistent spacing/layout via a scale (4/8px grid or equivalent), not
  arbitrary values per screen.

---

## 8. Dependency hygiene (enforced, not aspirational)

Before merging to `main`:
- Run an unused-dependency check (e.g. `depcheck` / `knip`) — remove
  anything flagged.
- Run `npm audit` / equivalent — no known high/critical vulnerabilities
  left unresolved without a documented reason.
- No two packages doing the same job (e.g. two date libraries, two HTTP
  clients) — pick one, standardize.
- Pin or range dependencies deliberately; don't let lockfile drift go
  unreviewed in a PR.

---

## 9. Definition of done (per feature)

A feature isn't done until:
- [ ] Lives entirely under `features/<name>/`, no leakage into other
      feature folders.
- [ ] Every file is under the line-count ceiling (§0).
- [ ] Gateway → controller → service → repository layering respected,
      no layer skipped.
- [ ] All tenant/user-scoped queries filtered by the authenticated scope,
      not client input.
- [ ] All inputs schema-validated at the boundary.
- [ ] Tests cover the service layer (business logic) independent of
      HTTP/UI.
- [ ] No new unused dependencies introduced.
- [ ] Uses shared design tokens/components — no ad hoc styling.
- [ ] Structured logs + correlation ID on any new request path.

---

## 10. When starting a brand-new project

1. Scaffold the folder structure in §1 before writing the first feature.
2. Set up `config/` with a validated env schema (fail fast on missing
   env vars).
3. Set up `infra/` (db client, cache client, logger) before any feature
   code touches the database.
4. Stand up the gateway layer (auth middleware, validation middleware,
   rate limiting, error handler) before the first real route.
5. Build the design token file and two or three core shared components
   (Button, Input, layout shell) before building feature UI.
6. Only then start building features — one at a time, each meeting the
   Definition of Done in §9 before starting the next.
