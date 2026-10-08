# AGENTS.md — Votable Lists

Members of a Discord server create ranked lists ("Best sci-fi movies"), nominate items into them, and rate those items. Each list ranks itself. The first list is movies (via TMDB). The architecture must make adding a new item source a new adapter, not a rewrite.

## Non-negotiables

1. **Domain-driven design with strict bounded contexts.** The boundaries below are enforced by tooling, not by convention.
2. **TypeScript, strict, everywhere.** That includes the server, the web app, config and scripts.
3. **Privacy and security by default.** See the section below. When in doubt, store less and expose less.
4. **Ship small.** Every milestone must be deployable and green on `npm run check`.
5. **Deployment-agnostic.** One deployment serves one Discord community, and any community can fork and deploy its own. Nothing specific to a community (server, roles, site name, URLs, lists) is written into code: it comes from the environment (see Environment) or from the List aggregate.

## Stack

- Node 22, TypeScript 5 with `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, ESM only.
- Netlify Functions v2 (`.mts`) for the API, Netlify Blobs for persistence.
- Vue 3, Vite and TypeScript (`<script setup lang="ts">`) for the web app. No UI kit.
- zod for input validation, at the HTTP boundary only.
- Vitest for tests, dependency-cruiser for boundary rules, ESLint and Prettier.
- Add no other runtime dependency without asking first.

## Bounded contexts

| Context    | Owns                                                                                                                                   | Never owns               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `identity` | Member, Session, Role, Actor (who is asking and what they may do), Discord membership check                                            | anything about lists     |
| `catalog`  | CatalogItem (source, externalId, title, subtitle, imageUrl, meta), the `ItemSource` port, and its adapters: `tmdb-movie`, `freeform`   | votes, lists             |
| `lists`    | the **List** aggregate (config, schedule, lifecycle, policies) and **Entry** (a nominated item, holding a snapshot of its CatalogItem) | scores                   |
| `voting`   | the **Ballot** aggregate: one per member per list, mapping entryId to score                                                            | ranking math             |
| `ranking`  | the **Leaderboard** read model: a projection of entries and ballots, plus the ranking strategies                                       | writes to other contexts |

**Context map.** `identity` provides an `Actor` to every use case. `catalog` is upstream of `lists`, which snapshots items at nomination time. `lists` is upstream of `voting` (is the list open, does the entry exist, what is the scale). `lists` and `voting` are both upstream of `ranking`.

**Ubiquitous language.** List, Entry, Nomination, Ballot, Score, Leaderboard, Member, Admin, Actor. The word "movie" appears only inside the `tmdb-movie` adapter and in UI copy.

## Layout

```
src/
  shared/kernel/          Result, Brand<T>, Clock, IdGenerator, DomainError. No context knowledge.
  contexts/<context>/
    domain/               entities, value objects, aggregates, pure functions
    application/          one file per use case + the ports it needs
    infrastructure/       adapters: Blobs repositories, Discord, TMDB; testing/ holds InMemory* adapters
    module.ts             context composition: builds this context's adapters and use cases
    index.ts              PUBLIC API: the module factory, its public interface, DTO types. The only importable entry point.
  server/
    composition.ts        composition root: reads env, creates platform deps, connects context modules
    http/                 zod schemas, auth/origin middleware, Result → HTTP mapping, contracts.ts (API types)
  web/                    Vue app
netlify/functions/        thin handlers: parse → use case → map. No business logic.
```

## Dependency rules (dependency-cruiser, fail the build)

- `domain` may import only its own `domain` and `shared/kernel`. It may not import `node:*`, Netlify, zod, or any other package.
- `application` may import its own `domain` and `shared/kernel`. Anything external, including another context, goes behind a **port** that the application layer declares itself.
- `infrastructure` may import its own context, external SDKs, and **another context's `index.ts`**. This is the only legal path between contexts.
- No context imports another context's `domain`, `application` or `infrastructure`.
- Files at a context's root (`index.ts`, `module.ts`) import only their own context. Knowledge of another context lives only in `infrastructure`.
- Outside `src/contexts`, a context is importable only through its `index.ts`.
- `shared/kernel` imports nothing outside itself.
- zod is imported only in `src/server/http`.
- `netlify/functions` imports only `src/server`.
- `web` imports only types from `src/server/http/contracts.ts`.

Each rule has a case in `test/boundaries/`. A new rule gets a new fixture case in the same change.

## Composition

Every context assembles itself, and the composition root only connects contexts.

- **`module.ts`** exports one factory, `create<Context>Module(deps)`. It builds the context's repositories and adapters from `infrastructure/`, injects them into the use-case factories, and returns the context's public interface: an object of ready use cases.
- **`deps`** holds only two kinds of thing: platform dependencies (Blobs store, Clock, IdGenerator, config values read from env) and the public interfaces of upstream modules. It never holds another context's repository or adapter, so a context cannot reach another context's store.
- **`index.ts`** re-exports the module factory, the public interface type, and DTO types. Nothing else leaves a context.
- **`server/composition.ts`** reads and validates env once, creates platform dependencies, and calls the module factories in context-map order (`identity`, `catalog` → `lists` → `voting` → `ranking`), passing upstream modules downstream.
- **Tests** inside a context build use cases directly with `InMemory*` adapters from `infrastructure/testing/`. They do not go through `module.ts`.

**Pattern for cross-context calls.** `voting/application/ports.ts` declares `ListReader`. `voting/infrastructure/lists-reader.ts` implements it on top of the lists module's public interface, which it imports as a type from `lists/index.ts`. `voting/module.ts` takes that interface in its `deps` and builds the reader. `server/composition.ts` passes the lists module into `createVotingModule`.

## Domain invariants

**Lists**

- Lifecycle: `draft → scheduled → open → closed → archived`. `draft` and `archived` are set explicitly. The other three are derived from the schedule and the Clock.
- Schedule: `opensAt`, an optional `nominationsCloseAt`, and `closesAt`, with `opensAt < nominationsCloseAt ≤ closesAt`.
- Config: `title`, `slug`, `description`, `itemSource`, `scale` (default 1–10), `maxNominationsPerMember`, `resultsVisibility` (`live` or `after-close`), `ranking` (`{ strategy: 'bayesian', minVotes }`), `showNominators`, and an optional `requiredRoleId`.
- Only Admins create and edit lists. All of the config is editable in `draft`. Once a list is `scheduled` or `open`, only `description` and an extension of `closesAt` may change.
- Nominations are allowed while the list is open and before `nominationsCloseAt`. A given item (`source` and `externalId`) can be nominated only once per list. Each member has a nomination cap.

**Voting**

- Each member has one ballot per list. A score is an integer within the list's scale and must refer to an existing entry. Scores can be set or cleared only while the list is open.

**Ranking**

- Ranking is a pure function. The default is a Bayesian average, `(v/(v+m))·R + (m/(v+m))·C`, and entries with `v < m` are flagged `provisional`.
- The leaderboard is cached per list and rebuilt when its TTL expires or when a new entry is nominated. Scores alone do not invalidate it.
- When `resultsVisibility = 'after-close'`, no aggregate numbers leave the server before `closesAt`.

## Persistence (Netlify Blobs)

Each context has its own store. A context never reads another context's store.

| Store      | Keys                                        |
| ---------- | ------------------------------------------- |
| `identity` | `member/{memberId}`                         |
| `lists`    | `list/{listId}`, `entry/{listId}/{entryId}` |
| `voting`   | `ballot/{listId}/{memberId}`                |
| `ranking`  | `leaderboard/{listId}`                      |

- Aggregate writes use optimistic concurrency, either `onlyIfMatch` with the ETag or `onlyIfNew`. On a conflict, retry the use case once, then return `409`.
- Repositories map versioned persistence records (`{ v: 1, ... }`) to and from domain objects. Domain objects are never serialized directly.

## Security & privacy

- **OAuth.** Discord with the scopes `identify guilds.members.read` only, never `email`. Use a `state` cookie for CSRF. Discard the Discord access token right after the membership check.
- **Session.** An HMAC-signed cookie with `HttpOnly; Secure; SameSite=Lax; Path=/` and a 7-day TTL. It holds `memberId`, a snapshot of roles, and `exp`. Rotating `SESSION_SECRET` logs everyone out.
- **Mutations.** Only `POST`, `PUT` or `DELETE`, and the `Origin` header must match `SITE_URL`.
- **Authorization** lives in use cases, which receive an `Actor`. It never lives in handlers or in the UI.
- **Validation.** zod at the boundary. The domain re-checks its own invariants regardless.
- **Ballots are private.** The API returns the caller's own ballot plus aggregates, and never anyone else's scores.
- **Data minimization.** Store only the Discord ID, display name and avatar URL. `GET /api/me/export` and `DELETE /api/me` export and erase a member's data.
- **Secrets** live only in Netlify environment variables. Nothing secret goes in `VITE_*`.
- **Headers** in `netlify.toml`: a strict CSP whose `img-src` allows only the image hosts of the integrations in use (the Discord avatar CDN `cdn.discordapp.com`, and the TMDB image host for `tmdb-movie`). A new adapter that serves images adds its host here, HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, and `Permissions-Policy`.
- **Rate limiting** with Netlify's function-level `rateLimit` config on search and on every mutation.
- **Logs** never contain tokens, cookies or request bodies.
- **Retention.** Purge catalog snapshots on archived lists after 6 months, per TMDB's terms. Keep TMDB attribution in the UI.

## Environment

Everything that varies per deployment lives in env, and everything that varies per list lives in the List aggregate. `server/composition.ts` validates env at startup and fails fast with the name of any missing variable. No other module reads `process.env`.

| Variable                | Required         | Purpose                                                                                                                                                                                                                                               |
| ----------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SITE_URL`              | yes              | the site's public origin, e.g. `https://lists.example.org` (scheme and host, no path or trailing slash). The single source for the OAuth redirect URI (`${SITE_URL}/api/auth/callback`) and the `Origin` check. Netlify's built-in `URL` is not used. |
| `DISCORD_CLIENT_ID`     | yes              | Discord OAuth application                                                                                                                                                                                                                             |
| `DISCORD_CLIENT_SECRET` | yes              | Discord OAuth application (secret)                                                                                                                                                                                                                    |
| `DISCORD_GUILD_ID`      | yes              | the community's Discord server; only its members can sign in                                                                                                                                                                                          |
| `ADMIN_ROLE_ID`         | yes              | Discord role whose holders are Admins                                                                                                                                                                                                                 |
| `SESSION_SECRET`        | yes              | HMAC key for session cookies (secret, at least 32 random bytes)                                                                                                                                                                                       |
| `TMDB_READ_TOKEN`       | for `tmdb-movie` | TMDB API read token (secret). Without it, the `tmdb-movie` source is unavailable                                                                                                                                                                      |
| `VITE_SITE_NAME`        | no               | display name of the site, default `Votable Lists`. Public, baked into the web build                                                                                                                                                                   |

`.env.example` lists the same variables and stays in sync with this table.

## Conventions

- **Use cases** are factories: `makeRateEntry(deps) => (actor, input) => Promise<Result<Output, DomainError>>`.
- **Domain errors** are returned as values, not thrown. `server/http` maps them to status codes.
- **Testing.** Domain and application tests use `InMemory*` adapters. Each Blobs repository gets one integration test against `@netlify/blobs/server`. Write a test first for every invariant listed above.
- **Definition of done.** `npm run check` (tsc, eslint, depcruise, vitest) is green, and the milestone works under `netlify dev`.
