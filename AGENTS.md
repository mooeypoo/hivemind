# AGENTS.md — Votable Lists

Members of one Discord server create ranked lists ("Best sci-fi movies"), nominate items into them, and rate those items. Each list ranks itself. The first list is movies (via TMDB). The architecture must make adding a new item source a new adapter, not a rewrite.

## Non-negotiables

1. **Domain-driven design with strict bounded contexts.** The boundaries below are enforced by tooling, not by convention.
2. **TypeScript, strict, everywhere.** That includes the server, the web app, config and scripts.
3. **Privacy and security by default.** See the section below. When in doubt, store less and expose less.
4. **Ship small.** Every milestone must be deployable and green on `npm run check`.

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
    index.ts              PUBLIC API: use-case factories + DTO types. The only importable entry point.
  server/
    composition.ts        composition root: builds adapters, injects them into use cases
    http/                 zod schemas, auth/origin middleware, Result → HTTP mapping, contracts.ts (API types)
  web/                    Vue app
netlify/functions/        thin handlers: parse → use case → map. No business logic.
```

## Dependency rules (dependency-cruiser, fail the build)

- `domain` may import only its own `domain` and `shared/kernel`. It may not import `node:*`, Netlify, zod, or any other package.
- `application` may import its own `domain` and `shared/kernel`. Anything external, including another context, goes behind a **port** that the application layer declares itself.
- `infrastructure` may import its own context, external SDKs, and **another context's `index.ts`**. This is the only legal path between contexts.
- No context imports another context's `domain`, `application` or `infrastructure`.
- `netlify/functions` imports only `src/server`.
- `web` imports only types from `src/server/http/contracts.ts`.

**Pattern for cross-context calls.** `voting/application/ports.ts` declares `ListReader`. `voting/infrastructure/lists-reader.ts` implements it by calling `lists/index.ts`. `server/composition.ts` wires the two together.

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
- **Mutations.** Only `POST`, `PUT` or `DELETE`, and the `Origin` header must match the site URL.
- **Authorization** lives in use cases, which receive an `Actor`. It never lives in handlers or in the UI.
- **Validation.** zod at the boundary. The domain re-checks its own invariants regardless.
- **Ballots are private.** The API returns the caller's own ballot plus aggregates, and never anyone else's scores.
- **Data minimization.** Store only the Discord ID, display name and avatar URL. `GET /api/me/export` and `DELETE /api/me` export and erase a member's data.
- **Secrets** live only in Netlify environment variables. Nothing secret goes in `VITE_*`.
- **Headers** in `netlify.toml`: a strict CSP that allows the TMDB image host and the Discord avatar CDN (`cdn.discordapp.com`) for `img-src`, HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, and `Permissions-Policy`.
- **Rate limiting** with Netlify's function-level `rateLimit` config on search and on every mutation.
- **Logs** never contain tokens, cookies or request bodies.
- **Retention.** Purge catalog snapshots on archived lists after 6 months, per TMDB's terms. Keep TMDB attribution in the UI.

## Environment

`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID`, `ADMIN_ROLE_ID`, `SESSION_SECRET`, `TMDB_READ_TOKEN`. Everything that varies per list lives in the List aggregate, not in env.

## Conventions

- **Use cases** are factories: `makeRateEntry(deps) => (actor, input) => Promise<Result<Output, DomainError>>`.
- **Domain errors** are returned as values, not thrown. `server/http` maps them to status codes.
- **Testing.** Domain and application tests use `InMemory*` adapters. Each Blobs repository gets one integration test against `@netlify/blobs/server`. Write a test first for every invariant listed above.
- **Definition of done.** `npm run check` (tsc, eslint, depcruise, vitest) is green, and the milestone works under `netlify dev`.
