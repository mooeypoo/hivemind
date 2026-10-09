# AGENTS.md — Votable Lists

Members of a Discord server create ranked lists ("Best sci-fi movies"), nominate items into them, and rate those items. Each list ranks itself. The first list is movies (via TMDB). The architecture must make adding a new item source a new adapter, not a rewrite.

## Non-negotiables

1. **Domain-driven design with strict bounded contexts.** The boundaries below are enforced by tooling, not by convention.
2. **TypeScript, strict, everywhere.** That includes the server, the web app, config and scripts.
3. **Privacy and security by default.** See the section below. When in doubt, store less and expose less.
4. **Ship small.** Every milestone must be deployable and green on `npm run check`, and ships the UI for what it adds, so it can be tried in a browser.
5. **Deployment-agnostic.** One deployment serves one Discord community, and any community can fork and deploy its own. Nothing specific to a community (server, roles, site name, URLs, lists) is written into code: it comes from the environment (see Environment) or from the List aggregate.

## Stack

- Node 22, TypeScript 5 with `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, ESM only.
- Netlify Functions v2 (`.mts`) for the API, Netlify Blobs for persistence.
- Vue 3, Vite and TypeScript (`<script setup lang="ts">`) for the web app. No UI kit.
- zod for input validation, at the HTTP boundary only.
- Vitest for tests, dependency-cruiser for boundary rules, ESLint and Prettier.
- Add no other runtime dependency without asking first.

## Bounded contexts

| Context    | Owns                                                                                                                                                                                         | Never owns               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `identity` | Member, Session, Role, Actor (who is asking and what they may do), Discord membership check                                                                                                  | anything about lists     |
| `catalog`  | CatalogItem (source, externalId, title, subtitle, imageUrl), the **Preset** aggregate (an Admin's CSV of items), the `ItemSource` port, and its adapters: `tmdb-movie`, `freeform`, `preset` | votes, lists             |
| `lists`    | the **List** aggregate (config, schedule, lifecycle, policies) and **Entry** (a nominated item, holding a snapshot of its CatalogItem)                                                       | scores                   |
| `voting`   | the **Ballot** aggregate: one per member per list, mapping entryId to score                                                                                                                  | ranking math             |
| `ranking`  | the **Leaderboard** read model: a projection of entries and ballots, plus the ranking strategies                                                                                             | writes to other contexts |

**Context map.** `identity` provides an `Actor` to every use case. `catalog` is upstream of `lists`, which snapshots items at nomination time. `lists` is upstream of `voting` (is the list open, does the entry exist, what is the scale). `lists` and `voting` are both upstream of `ranking`.

**Ubiquitous language.** List, Entry, Nomination, Ballot, Score, Leaderboard, Member, Admin, Actor. The word "movie" appears only inside the `tmdb-movie` adapter and in UI copy.

## Layout

```
src/
  shared/kernel/          Result, Brand<T>, Clock, IdGenerator, DomainError, Actor. Pure TypeScript, no context knowledge.
  shared/infrastructure/  technical helpers for adapters (e.g. versioned Blobs reads). No domain knowledge.
  contexts/<context>/
    domain/               entities, value objects, aggregates, pure functions
    application/          one file per use case + the ports it needs
    infrastructure/       adapters: Blobs repositories, Discord, TMDB; testing/ holds InMemory* adapters
    module.ts             context composition: builds this context's adapters and use cases
    index.ts              PUBLIC API: the module factory, its public interface, DTO types. The only importable entry point.
  server/
    composition.ts        composition root: reads env, creates platform deps, connects context modules
    config.ts             env → validated AppConfig
    platform.ts           Clock, IdGenerator, Blobs stores, fetch: what the runtime provides
    functions.ts          the only module netlify/functions imports: `handle(endpoint)` and the endpoints
    http/                 zod schemas, cookies, auth/origin checks, Result → HTTP mapping, endpoints/, contracts.ts (API types)
  web/                    Vue app: pages/, components/, services/api.ts (typed fetch), state/, lib/ (pure helpers), public/styles.css
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
- `shared/infrastructure` is imported only by `infrastructure` layers and `src/server`, and imports nothing from contexts, server or web.
- Code under a `testing/` folder is imported only by tests.
- zod is imported only in `src/server/http`.
- `netlify/functions` imports only `src/server`.
- `web` imports only types from `src/server/http/contracts.ts`.

Each rule has a case in `test/boundaries/`. A new rule gets a new fixture case in the same change.

## Composition

Every context assembles itself, and the composition root only connects contexts.

- **`module.ts`** exports one factory, `create<Context>Module(deps)`. It builds the context's repositories and adapters from `infrastructure/`, injects them into the use-case factories, and returns the context's public interface: an object of ready use cases.
- **`deps`** holds only two kinds of thing: platform dependencies (Blobs store, Clock, IdGenerator, config values read from env) and the public interfaces of upstream modules. It never holds another context's repository or adapter, so a context cannot reach another context's store.
- **`index.ts`** re-exports the module factory, the public interface type, and DTO types. Nothing else leaves a context.
- **`server/composition.ts`** reads and validates env once, creates platform dependencies, and calls the module factories in context-map order (`catalog` → `lists` → `voting` → `ranking`), passing upstream modules downstream. `identity` comes last, because it receives every context's `PersonalDataContributor`. Nothing depends on the identity module itself; other contexts only see the `Actor` it produces.
- **Tests** inside a context build use cases directly with `InMemory*` adapters from `infrastructure/testing/`. They do not go through `module.ts`. HTTP tests in `src/server` build the real app with `createApp`, a local Blobs server and a fake `fetch`.

**The Actor.** `Actor` lives in `shared/kernel`, because every context's use cases receive one and an application layer cannot import identity. It is either anonymous or a member with `memberId`, `displayName` (for display only, never for authorization), a `roleIds` snapshot and `isAdmin`. Only identity creates Actors. A member is an Admin if their sign-in role snapshot includes `ADMIN_ROLE_ID`, or if their Discord user ID is in `ADMIN_MEMBER_IDS`. This is evaluated on every request, so a change to the env list applies on the next deploy. `requireMember(actor)` and `requireAdmin(actor)` are the standard first lines of member-only and Admin-only use cases.

**Errors.** A `DomainError` has a `kind` (`unauthenticated`, `forbidden`, `not-found`, `conflict`, `invalid`, `unavailable`) and a specific, namespaced `code` such as `identity.not-a-member`. `server/http` maps each kind to one status (401, 403, 404, 409, 422, 503), so a new error never needs an HTTP change.

**Personal data.** `GET /api/me/export` and `DELETE /api/me` must cover every context. Identity declares the port `PersonalDataContributor { context, exportFor(memberId), eraseFor(memberId) }`. Every context that stores member data exposes one from its module, and composition passes it into `createIdentityModule`. Erasure runs every contributor first and deletes the member record last, so a failure part-way leaves the member able to retry. A context that starts storing member data adds its contributor and a test in the same change. A contributor's `eraseFor` returns a `Result`, and an error stops the erasure before the member record is deleted. Lists exports a member's nominations; erasure keeps their entries, because others have rated them, but removes their name from them and deletes their nomination ledgers.

**Sessions.** Sessions are stateless signed cookies, but `resolveActor` also loads the member, so erasing a member ends their sessions at once. The roles in a session are a snapshot from sign-in, so Discord role and membership changes apply at the next sign-in. Sessions last 12 hours for exactly this reason: no Discord credential is kept after sign-in, so a short session is how changes in Discord reach the app. Re-sign-in asks Discord to skip its consent screen (`prompt=none`), so for members who have already approved the app it is a silent redirect. Rotating `SESSION_SECRET` signs everyone out at once.

**Item sources.** When an Admin creates a list, they choose where its items come from. The catalog owns the kinds; lists treat the source reference as opaque and ask the catalog through their `Catalog` port.

| Kind         | Members add items by                                                       | Validation                                                                             |
| ------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `tmdb-movie` | searching TMDB and picking a result                                        | re-fetched from TMDB on nomination; adult titles never appear. Needs `TMDB_READ_TOKEN` |
| `freeform`   | typing a title                                                             | 1–200 characters; duplicates compared after Unicode, case and spacing normalisation    |
| `preset`     | choosing from an Admin's imported CSV (`title[,subtitle]`, up to 200 rows) | rows validated on import, with errors reported by row; presets are immutable           |

A list's `entryMode` is `nominations` (members nominate) or `seeded` (every item of the source becomes an entry when the list is scheduled, and there are no nominations). Only a preset can seed. To add a source: write an `ItemSource` adapter in `catalog/infrastructure`, register it in `catalog/module.ts`, add its kind to `ItemSourceRef` and to the HTTP schema, and, if it serves images, add the image host to the CSP `img-src`. Free-text and preset items carry no images, because arbitrary image hosts would break the CSP and expose viewers' IP addresses.

**Pattern for cross-context calls.** `voting/application/ports.ts` declares `ListReader`. `voting/infrastructure/lists-reader.ts` implements it on top of the lists module's public interface, which it imports as a type from `lists/index.ts`. `voting/module.ts` takes that interface in its `deps` and builds the reader. `server/composition.ts` passes the lists module into `createVotingModule`.

## Domain invariants

**Lists**

- Lifecycle: `draft → scheduled → open → closed → archived`. `draft` and `archived` are set explicitly. The other three are derived from the schedule and the Clock.
- Schedule: `opensAt`, an optional `nominationsCloseAt`, and `closesAt`, with `opensAt < nominationsCloseAt ≤ closesAt`.
- Config: `title`, `slug` (unique), `description`, `itemSource`, `entryMode` (`nominations` or `seeded`; seeded needs a preset), `scale` (default 1–10), `maxNominationsPerMember` (null means unlimited), `resultsVisibility` (`live` or `after-close`), `ranking` (`{ strategy: 'bayesian', minVotes }`), `showNominators`, and `requiredRoleIds` (empty means every member; otherwise a member needs any one of them, up to 25 roles). Defaults for omitted fields are `LIST_DEFAULTS`.
- Only Admins create and edit lists. All of the config is editable in `draft`. Once a list is `scheduled` or `open`, only `description` and an extension of `closesAt` may change.
- Scheduling publishes a draft; a list closes in the future. Archiving is allowed only once a list is closed.
- Nominations are allowed while the list is open and before `nominationsCloseAt`, and never on a seeded list. A given item (`source` and `externalId`) can be nominated only once per list: the entry id derives from them and entries are created with `onlyIfNew`. Each member has a nomination cap, enforced by their nomination ledger; a duplicate gives the nomination back.
- An entry snapshots the catalog item and the nominator's display name. `showNominators` decides whether members see that name.
- Every list endpoint needs a signed-in member. Drafts exist only for Admins; everyone else gets not-found. `requiredRoleIds` limit who may take part (nominate, and later vote), not who may view. Admins enter role IDs; the editor recognises a typed role name and explains how to copy the ID.

**Voting**

- Each member has one ballot per list. A score is an integer within the list's scale and must refer to an existing entry. Scores can be set or cleared only while the list is open.

**Ranking**

- Ranking is a pure function. The default is a Bayesian average, `(v/(v+m))·R + (m/(v+m))·C`, and entries with `v < m` are flagged `provisional`. Provisional entries stay in their computed place on the leaderboard, tagged with how many more votes they need. `minVotes` never limits voting, which is open the whole time the list is.
- The leaderboard is cached per list and rebuilt when its TTL expires or when a new entry is nominated. Scores alone do not invalidate it.
- When `resultsVisibility = 'after-close'`, no aggregate numbers leave the server before `closesAt`.

## Persistence (Netlify Blobs)

Each context has its own store. A context never reads another context's store.

| Store      | Keys                                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity` | `member/{memberId}`                                                                                                                                                                                           |
| `catalog`  | `preset/{presetId}`                                                                                                                                                                                           |
| `lists`    | `list/{listId}`, `slug/{slug}` (unique slug → listId), `entry/{listId}/{entryId}`, `nominator/{memberId}/{listId}` (a member's nominations in a list; member-first so export and erasure find them by prefix) |
| `voting`   | `ballot/{listId}/{memberId}`                                                                                                                                                                                  |
| `ranking`  | `leaderboard/{listId}`                                                                                                                                                                                        |

- Aggregate writes use optimistic concurrency, either `onlyIfMatch` with the ETag or `onlyIfNew`. On a conflict, retry the use case once, then return `409`. Use `withConflictRetry` from the kernel, wrapped around the part of the use case that reads and writes state. Never repeat a single-use external call, such as an OAuth code exchange.
- Repositories map versioned persistence records (`{ v: 1, ... }`) to and from domain objects. Domain objects are never serialized directly.

## HTTP API

Each route is one file in `netlify/functions` (`export default handle(endpoint)` plus `config.path` and `config.method`). Its endpoint lives in `src/server/http/endpoints/` and does three things: parse, call one use case, map the result. Wire types live in `contracts.ts`. API responses send `Cache-Control: no-store`.

| Route                        | Method | Notes                                                                                |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `/api/auth/login`            | GET    | Sets the `__Host-login_state` cookie (10 minutes) and redirects to Discord           |
| `/api/auth/callback`         | GET    | Redirects to `/` with the `__Host-session` cookie, or to `/?login=<code>` on failure |
| `/api/auth/logout`           | POST   | Clears the session cookie                                                            |
| `/api/me`                    | GET    | `MeDto`; 401 when signed out                                                         |
| `/api/me/export`             | GET    | `MyDataExportDto` as a download                                                      |
| `/api/me`                    | DELETE | Erases the member's data in every context and clears the session cookie              |
| `/api/catalog/sources`       | GET    | Admin: the item sources this site offers                                             |
| `/api/catalog/presets`       | POST   | Admin: import a CSV preset; errors by row                                            |
| `/api/lists`                 | GET    | Lists the caller may see                                                             |
| `/api/lists`                 | POST   | Admin: create a draft                                                                |
| `/api/lists/:list`           | GET    | Detail with entries. `:list` is an id or a slug                                      |
| `/api/lists/:list`           | PUT    | Admin: edit, within the lifecycle rules                                              |
| `/api/lists/:list/schedule`  | POST   | Admin: set the schedule and publish (seeds a seeded list)                            |
| `/api/lists/:list/archive`   | POST   | Admin: archive a closed list                                                         |
| `/api/lists/:list/search?q=` | GET    | Search the list's item source while nominations are open                             |
| `/api/lists/:list/entries`   | POST   | Nominate `{ externalId }`, or `{ title }` for free text                              |

Request bodies are JSON, at most 256 KB, validated by zod with unknown keys rejected. Shape errors return 422 `http.invalid-input` with one detail per problem; domain rule errors also carry `details` where there is more than one.

**Expired sessions.** A session can end in the middle of something. When a request returns 401, the web app sends the person to `/api/auth/login?returnTo=<current path>` and back again. `returnTo` accepts same-site paths only; anything else becomes `/`, and it is checked again when read back from its cookie, so sign-in can never be an open redirect. Forms keep unsaved input in `sessionStorage` (`lib/drafts.ts`) so nothing typed is lost.

## Web app

- Vue 3 with `<script setup lang="ts">`, `vue-router`, and no UI kit. The web app imports only types from `contracts.ts`; it calls the API through `services/api.ts`.
- **Styling lives only in `src/web/public/styles.css`.** The CSP (`style-src 'self'`) blocks `<style>` blocks and inline `style` attributes, including the ones Vite injects in development. ESLint rejects `<style>` blocks and `style` bindings in `.vue` files.
- **Mobile-first and accessible:** semantic landmarks and a skip link, a label for every input, errors announced with `role="alert"`, visible focus, WCAG AA contrast, light and dark themes from `prefers-color-scheme`, 44 px touch targets, and no horizontal scrolling at 320 px.
- Authorization stays in use cases. The UI hides what a member can't do (it reads `viewer` and `isAdmin`), but the server decides.
- Logic worth testing goes in `lib/` as pure functions. Components are tested with `@vue/test-utils` in happy-dom (`// @vitest-environment happy-dom`).
- Netlify serves `index.html` for any path that isn't a file or a function, so deep links work.

## Security & privacy

- **OAuth.** Discord with the scopes `identify guilds.members.read` only, never `email`. Use a `state` cookie for CSRF. Discard the Discord access token right after the membership check.
- **Session.** An HMAC-signed cookie with `HttpOnly; Secure; SameSite=Lax; Path=/` and a 12-hour TTL. It holds `memberId`, a snapshot of roles, and `exp`. The TTL bounds how long a Discord role or membership change takes to apply. Rotating `SESSION_SECRET` logs everyone out.
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

Everything that varies per deployment lives in env, and everything that varies per list lives in the List aggregate. `server/config.ts` validates env, and `server/composition.ts` is the only module in `src/` that reads `process.env`. A misconfigured deploy fails on its first request, and the function log lists every missing or malformed variable at once. [docs/discord-setup.md](docs/discord-setup.md) explains how to obtain each Discord value.

| Variable                | Required         | Purpose                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SITE_URL`              | yes              | the site's public origin, e.g. `https://lists.example.org` (scheme and host, no path or trailing slash). Must be `https://`, except `http://localhost` for development. The single source for the OAuth redirect URI (`${SITE_URL}/api/auth/callback`) and the `Origin` check. Netlify's built-in `URL` is not used. |
| `DISCORD_CLIENT_ID`     | yes              | Discord OAuth application                                                                                                                                                                                                                                                                                            |
| `DISCORD_CLIENT_SECRET` | yes              | Discord OAuth application (secret)                                                                                                                                                                                                                                                                                   |
| `DISCORD_GUILD_ID`      | yes              | the community's Discord server; only its members can sign in                                                                                                                                                                                                                                                         |
| `ADMIN_ROLE_ID`         | one of these two | Discord role whose holders are Admins                                                                                                                                                                                                                                                                                |
| `ADMIN_MEMBER_IDS`      | one of these two | comma-separated Discord **user IDs** (never usernames, which can change hands) of members who are Admins whatever their roles, e.g. whoever runs the site. Evaluated on every request                                                                                                                                |
| `SESSION_SECRET`        | yes              | HMAC key for session cookies (secret, at least 32 random bytes)                                                                                                                                                                                                                                                      |
| `TMDB_READ_TOKEN`       | for `tmdb-movie` | TMDB API read token (secret). Without it, the `tmdb-movie` source is unavailable                                                                                                                                                                                                                                     |
| `VITE_SITE_NAME`        | no               | display name of the site, default `Votable Lists`. Public, baked into the web build                                                                                                                                                                                                                                  |

`.env.example` lists the same variables and stays in sync with this table.

## Conventions

- **Use cases** are factories: `makeRateEntry(deps) => (actor, input) => Promise<Result<Output, DomainError>>`.
- **Domain errors** are returned as values, not thrown. `server/http` maps them to status codes.
- **Testing.** Domain and application tests use `InMemory*` adapters. Each Blobs repository gets one integration test against `@netlify/blobs/server`. Write a test first for every invariant listed above.
- **Definition of done.** `npm run check` (tsc, eslint, depcruise, vitest) is green, and the milestone works under `netlify dev`.

## Milestones

The privacy page describes exactly what the app stores. Any change to stored data updates it in the same change.

| Milestone | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Status |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| M0        | Skeleton, tooling, boundary rules                                                                                                                                                                                                                                                                                                                                                                                                                                | done   |
| M1        | Identity: Discord sign-in, sessions, Actor, my data                                                                                                                                                                                                                                                                                                                                                                                                              | done   |
| M2        | Catalog and lists, with choosable item sources                                                                                                                                                                                                                                                                                                                                                                                                                   | done   |
| Web slice | Browser UI for identity and lists                                                                                                                                                                                                                                                                                                                                                                                                                                | done   |
| M3        | Voting, with its rating UI                                                                                                                                                                                                                                                                                                                                                                                                                                       | next   |
| M4        | Ranking, with the leaderboard UI                                                                                                                                                                                                                                                                                                                                                                                                                                 |        |
| M5        | Web polish and accessibility audit; **community badge** (Discord server name and icon from a public invite lookup, `DISCORD_INVITE_CODE`, falling back to a name setting); **footer** (community, credit to Moriel Schottlender linking to https://moriel.tech, source link to https://github.com/mooeypoo/hivemind, configurable for forks); **privacy page** (what is stored and what never is, retention, and what Download and Delete my data do); a LICENSE |        |
| M6        | Hardening and launch: rate limits, CSP check, retention purge, seed script, deploy previews                                                                                                                                                                                                                                                                                                                                                                      |        |
