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

| Context    | Owns                                                                                                                                                                                         | Never owns                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `identity` | Member, Session, Role, Actor (who is asking and what they may do), Discord membership check                                                                                                  | anything about lists                   |
| `catalog`  | CatalogItem (source, externalId, title, subtitle, imageUrl), the **Preset** aggregate (an Admin's CSV of items), the `ItemSource` port, and its adapters: `tmdb-movie`, `freeform`, `preset` | votes, lists                           |
| `lists`    | the **List** aggregate (config, schedule, lifecycle, policies) and **Entry** (a nominated item, holding a snapshot of its CatalogItem)                                                       | scores                                 |
| `voting`   | the **Ballot** aggregate: one per member per list, mapping entryId to score                                                                                                                  | ranking math                           |
| `ranking`  | the **Leaderboard** read model: a projection of entries and ballots, plus the ranking strategies                                                                                             | writes to other contexts               |
| `backup`   | the **backup file** format (versioned) and the export and import of lists, orchestrated through every other context's backup services                                                        | readable ballots; overwriting anything |

**Context map.** `identity` provides an `Actor` to every use case. `catalog` is upstream of `lists`, which snapshots items at nomination time. `lists` is upstream of `voting` (is the list open, does the entry exist, what is the scale). `lists` and `voting` are both upstream of `ranking`. `backup` is downstream of `lists`, `catalog`, `voting` and `identity`, and only ever goes through their public interfaces.

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

**Personal data.** `GET /api/me/export` and `DELETE /api/me` must cover every context. Identity declares the port `PersonalDataContributor { context, exportFor(memberId), eraseFor(memberId) }`. Every context that stores member data exposes one from its module, and composition passes it into `createIdentityModule`. Erasure runs every contributor first and deletes the member record last, so a failure part-way leaves the member able to retry. A context that starts storing member data adds its contributor and a test in the same change. A contributor's `eraseFor` returns a `Result`, and an error stops the erasure before the member record is deleted. Voting exports a member's ballots and deletes them on erasure. Lists exports a member's nominations; erasure keeps their entries, because others have rated them, but removes their name from them and deletes their nomination ledgers.

**Backups.** Admins export one list or all lists to a versioned JSON file, and import such files.

- **Votes stay private:** each context exports and restores its own part. Ballots leave voting only sealed (AES-256-GCM, from `BACKUP_KEY`), so whoever holds a file can't read anyone's scores.
- **Deleted data stays deleted:** `deleteMyData` first records `erased/{fingerprint}` (a keyed one-way hash of the member id, and the date; nothing else), kept for 2 years. Imports drop the names, nomination records and ballots of erased members.
- **A different key restores no personal data:** the file carries a `keyId`. If it doesn't match the current key, the lists and entries come back but no nominator names or votes.
- **Nothing is overwritten:** an import always adds lists. A taken address gets `-2`, `-3`… and the copy arrives hidden for review.
- Without `BACKUP_KEY`, backups are off and no fingerprints are recorded.

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

- Lifecycle: `draft → scheduled → open → closed → archived`. `draft` and `archived` are set explicitly. The other three are derived from the schedule and the Clock; a list without an end date stays `open` until an Admin closes voting.
- Schedule: `opensAt` (members can see the list, nominate and rate), an optional `nominationsCloseAt` (no new nominations; rating continues) and an optional `closesAt` (voting ends and scores are final; null means open-ended), with `opensAt < nominationsCloseAt ≤ closesAt` for whichever are set. A set `closesAt` must be in the future.
- Config: `title`, `slug` (unique), `description`, `itemSource`, `entryMode` (`nominations` or `seeded`; seeded needs a preset), `scale` (default 1–10), `maxNominationsPerMember` (null means unlimited), `resultsVisibility` (`live` or `after-close`), `scoreVisibility` (`private` or `public`, default private), `ranking` (`{ strategy: 'bayesian', minVotes }`), `showNominators`, and `requiredRoleIds` (empty means every member; otherwise a member needs any one of them, up to 25 roles). Defaults for omitted fields are `LIST_DEFAULTS`.
- Only Admins create and edit lists. All of the config is editable in `draft`. Once a list is `scheduled` or `open`, only `description`, `closesAt`, and removing a finite nomination cap may change. `closesAt` may only lengthen voting: later, removed (open-ended), or set in the future on an open-ended list. A removed cap cannot be restored after publishing.
- Public score visibility must be selected before publishing. After publishing it can only change from public to private, never back. Public scores appear only when the list's results are visible.
- **Close voting now** (Admins, open lists only) sets `closesAt` to now: scores become final and results waiting for the close are revealed.
- **Archive** (Admins) works on any published list, at any time: voting and nominations end, the list becomes read-only with its final results. It can't be undone.
- **Visibility** is `public` (all signed-in members) or `hidden` (only Admins; members get not-found everywhere, including voting and ranking). Admins change it at any time, even on archived lists; nothing is lost while hidden.
- Scheduling publishes a draft.
- Nominations are allowed while the list is open and before `nominationsCloseAt`, and never on a seeded list. A given item (`source` and `externalId`) can be nominated only once per list: the entry id derives from them and entries are created with `onlyIfNew`. Each member has a nomination cap, enforced by their nomination ledger; a duplicate gives the nomination back.
- An entry snapshots the catalog item and the nominator's display name. `showNominators` decides whether members see that name.
- Every list endpoint needs a signed-in member. Drafts exist only for Admins; everyone else gets not-found. `requiredRoleIds` limit who may take part (nominate, and later vote), not who may view. Admins name roles once on the Roles page (`/admin/roles`, a name → role ID table owned by identity); the list editor offers them as checkboxes, and keeps any required role that has no name yet.

**Voting**

- Each member has one ballot per list. A score is an integer within the list's scale and must refer to an existing entry. Scores can be set or cleared only while the list is open, by members holding any of the list's `requiredRoleIds`.
- A ballot stores the voter's display name only when its list chose public scores. `getPublicScores` requires a signed-in member and returns names with scores only when public scores and results are visible; it sorts scores high to low. Private lists return no public scores.
- Voting reads lists only through its `ListReader` port (`rulesForVoting`, `entryExists` on the lists module). No use case or route returns another member's ballot.

**Ranking**

- Ranking is a pure function. The default is a Bayesian average, `(v/(v+m))·R + (m/(v+m))·C`, and entries with `v < m` are flagged `provisional`. Provisional entries stay in their computed place on the leaderboard, tagged with how many more votes they need. `minVotes` never limits voting, which is open the whole time the list is.
- Entries with no votes are unranked and listed last; with no votes at all, nothing is ranked. Equal scores share a rank (1, 2, 2, 4), ordered by votes, then title. Strategies are pure functions registered in `ranking/domain/strategies.ts`.
- The leaderboard is cached per list and rebuilt when its TTL (`LEADERBOARD_TTL_SECONDS`, 2 minutes) expires or when a new entry is nominated (the cached board's entry ids differ from the list's). Scores alone do not invalidate it.
- When `resultsVisibility = 'after-close'`, no aggregate numbers leave the server until voting has ended (closed or archived), for anyone, Admins included: the response is only `{ hidden: true, revealsAt }`, with `revealsAt` null for open-ended lists.
- Ranking never receives member ids: voting's `scoresForList` hands it anonymous score maps, and the leaderboard stores aggregates only. Ranking has no personal-data contributor. After an erasure, a cached board can include that member's anonymous scores until its TTL ends.

## Persistence (Netlify Blobs)

Each context has its own store. A context never reads another context's store.

| Store      | Keys                                                                                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity` | `member/{memberId}`, `erased/{fingerprint}` (erasure fingerprints, see Backups; forgotten after 2 years), `community` (cached public name and icon, refreshed daily), `role-labels` (Admin-maintained names for role IDs)        |
| `catalog`  | `preset/{presetId}`                                                                                                                                                                                                              |
| `lists`    | `list/{listId}`, `slug/{slug}` (unique slug → listId), `entry/{listId}/{entryId}`, `nominator/{memberId}/{listId}` (a member's nominations in a list; member-first so export and erasure find them by prefix)                    |
| `voting`   | `ballot/{listId}/{memberId}` (list-first for ranking; a member's ballots, needed only for export and erasure, are found by listing `ballot/` and filtering by the member suffix, so there is no second index to keep consistent) |
| `ranking`  | `leaderboard/{listId}` (derived, no member ids; written unconditionally, since a concurrent rebuild produces the same board)                                                                                                     |

- Aggregate writes use optimistic concurrency, either `onlyIfMatch` with the ETag or `onlyIfNew`. On a conflict, retry the use case once, then return `409`. Use `withConflictRetry` from the kernel, wrapped around the part of the use case that reads and writes state. Never repeat a single-use external call, such as an OAuth code exchange.
- Repositories map versioned persistence records (`{ v: 1, ... }`) to and from domain objects. Domain objects are never serialized directly. Optional fields added later (`archivedAt` on lists, `snapshotPurgedAt` on entries) are read as null when absent.
- Production and local dev use site-wide stores; deploy previews and branch deploys use deploy-scoped stores (`src/server/platform.ts`).

## HTTP API

Each route is one file in `netlify/functions` (`export default handle(endpoint)` plus `config.path` and `config.method`). Its endpoint lives in `src/server/http/endpoints/` and does three things: parse, call one use case, map the result. Wire types live in `contracts.ts`. API responses send `Cache-Control: no-store`.

| Route                               | Method | Notes                                                                                        |
| ----------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| `/api/auth/login`                   | GET    | Sets the `__Host-login_state` cookie (10 minutes) and redirects to Discord                   |
| `/api/auth/callback`                | GET    | Redirects to `/` with the `__Host-session` cookie, or to `/?login=<code>` on failure         |
| `/api/auth/logout`                  | POST   | Clears the session cookie                                                                    |
| `/api/auth/demo`                    | POST   | Demo mode only: `{ persona }` signs in as a pretend account and creates the sample lists     |
| `/api/me`                           | GET    | `MeDto`; 401 when signed out                                                                 |
| `/api/me/export`                    | GET    | `MyDataExportDto` as a download                                                              |
| `/api/me`                           | DELETE | Erases the member's data in every context and clears the session cookie                      |
| `/api/catalog/sources`              | GET    | Admin: the item sources this site offers                                                     |
| `/api/catalog/presets`              | POST   | Admin: import a CSV preset; errors by row                                                    |
| `/api/lists`                        | GET    | Lists the caller may see                                                                     |
| `/api/lists`                        | POST   | Admin: create a draft                                                                        |
| `/api/lists/:list`                  | GET    | Detail with entries. `:list` is an id or a slug                                              |
| `/api/lists/:list`                  | PUT    | Admin: edit, within the lifecycle rules                                                      |
| `/api/lists/:list/schedule`         | POST   | Admin: set the schedule and publish (seeds a seeded list)                                    |
| `/api/lists/:list/archive`          | POST   | Admin: archive a published list, at any time                                                 |
| `/api/lists/:list/close`            | POST   | Admin: close voting now on an open list                                                      |
| `/api/lists/:list/visibility`       | PUT    | Admin: `{ visibility: 'public' \| 'hidden' }`, at any time                                   |
| `/api/lists/:list/score-visibility` | PUT    | Admin: `{ scoreVisibility }`; choose either in draft, only public → private after publishing |
| `/api/lists/:list/search?q=`        | GET    | Search the list's item source while nominations are open                                     |
| `/api/lists/:list/entries`          | POST   | Nominate `{ externalId }`, or `{ title }` for free text                                      |
| `/api/lists/:list/ballot`           | GET    | The caller's own scores                                                                      |
| `/api/lists/:list/ballot`           | PUT    | `{ entryId, score }` sets a score; `score: null` clears it                                   |
| `/api/lists/:list/scores`           | GET    | `{ visible: false }` or public names and scores, when results are visible                    |
| `/api/lists/:list/leaderboard`      | GET    | The leaderboard, or `{ hidden: true, revealsAt }` until an after-close list closes           |
| `/api/site`                         | GET    | Public: the community (name, icon, invite) and whether movie data is offered                 |
| `/api/roles`                        | GET    | Role names, for members                                                                      |
| `/api/roles`                        | PUT    | Admin: replace the role names; `{ labels, version }`, a stale version is refused             |
| `/api/admin/backup`                 | GET    | Admin: download a backup of every list, or `?list=<id or slug>` for one                      |
| `/api/admin/backup`                 | POST   | Admin: import a backup file (up to 5 MB); returns what was restored                          |

Request bodies are JSON, at most 256 KB, validated by zod with unknown keys rejected. Shape errors return 422 `http.invalid-input` with one detail per problem; domain rule errors also carry `details` where there is more than one.

**Expired sessions.** A session can end in the middle of something. When a request returns 401, the web app sends the person to `/api/auth/login?returnTo=<current path>` and back again. `returnTo` accepts same-site paths only; anything else becomes `/`, and it is checked again when read back from its cookie, so sign-in can never be an open redirect. Forms keep unsaved input in `sessionStorage` (`lib/drafts.ts`) so nothing typed is lost.

## Web app

- Vue 3 with `<script setup lang="ts">`, `vue-router`, and no UI kit. The web app imports only types from `contracts.ts`; it calls the API through `services/api.ts`.
- **Styling lives only in `src/web/public/styles.css`.** The CSP (`style-src 'self'`) blocks `<style>` blocks and inline `style` attributes, including the ones Vite injects in development. ESLint rejects `<style>` blocks and `style` bindings in `.vue` files.
- **Mobile-first and accessible:** semantic landmarks and a skip link, a label for every input, errors announced with `role="alert"`, visible focus, WCAG AA contrast, light and dark themes from `prefers-color-scheme`, 44 px touch targets, and no horizontal scrolling at 320 px.
- Authorization stays in use cases. The UI hides what a member can't do (it reads `viewer` and `isAdmin`), but the server decides.
- **Accessibility is tested.** `src/web/a11y.test.ts` mounts the whole app on every route in realistic states and runs axe (WCAG 2.1 A/AA and best practice); a new route or state gets a case there. `test/web/contrast.test.ts` checks every colour token pair in both themes (4.5:1 for text, 3:1 for control borders and focus). Each page sets its title with `usePageTitle`, and focus moves to the page on navigation.
- The header's site menu links to Lists, About and Privacy. `/about` describes list participation, score visibility, the community and credits.
- Logic worth testing goes in `lib/` as pure functions. Components are tested with `@vue/test-utils` in happy-dom (`// @vitest-environment happy-dom`).
- Netlify serves `index.html` for any path that isn't a file or a function, so deep links work.

## Security & privacy

- **OAuth.** Discord with the scopes `identify guilds.members.read` only, never `email`. Use a `state` cookie for CSRF. Discard the Discord access token right after the membership check.
- **Session.** An HMAC-signed cookie with `HttpOnly; Secure; SameSite=Lax; Path=/` and a 12-hour TTL. It holds `memberId`, a snapshot of roles, and `exp`. The TTL bounds how long a Discord role or membership change takes to apply. Rotating `SESSION_SECRET` logs everyone out.
- **Mutations.** Only `POST`, `PUT` or `DELETE`, and the `Origin` header must match `SITE_URL` in production. Outside production each deploy has its own address, so it must match the request's own origin (`app.siteOrigin(request)`): still a same-origin check.
- **Authorization** lives in use cases, which receive an `Actor`. It never lives in handlers or in the UI.
- **Validation.** zod at the boundary. The domain re-checks its own invariants regardless.
- **Ballots are private unless a list chose public scores before publishing; a published list can never switch from private to public.** Public scores are shown only after the list's results are visible, and only through the dedicated scores endpoint. The caller's ballot endpoint never returns anyone else's scores.
- **Data minimization.** Store only the Discord ID, display name and avatar URL. `GET /api/me/export` and `DELETE /api/me` export and erase a member's data.
- **Secrets** live only in Netlify environment variables. Nothing secret goes in `VITE_*`.
- **Headers** in `netlify.toml`: a strict CSP whose `img-src` allows only the image hosts of the integrations in use (the Discord avatar CDN `cdn.discordapp.com`, and the TMDB image host for `tmdb-movie`). A new adapter that serves images adds its host here, HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, and `Permissions-Policy`.
- **Header check.** `scripts/security-headers.ts` holds the rules; `test/netlify/headers.test.ts` checks `netlify.toml` against them, and the `deployed headers` GitHub Action runs `scripts/check-headers.ts` against every successful Netlify deploy, including no inline scripts or styles in the served HTML.
- **Rate limiting** with Netlify's function-level `rateLimit`, per IP and domain over 60 seconds, defined once in `src/server/functions.ts`: mutations 30, search 60, sign-in (login, callback, demo) 10. `test/netlify/functions.test.ts` fails if any guarded function lacks its limit.
- **Demo mode** (pretend sign-in with sample data) runs only with `DEMO_MODE=true` **and** a non-production deploy context: two independent locks, and in production the use case refuses regardless. Demo personas have `demo-` ids that can never be Discord ids. Outside production every context uses deploy-scoped Blobs stores, so previews never touch real members, lists or votes. Operator actors (`operator-…`) exist only for scripts and scheduled jobs, never for a request.
- **Logs** never contain tokens, cookies or request bodies.
- **Retention.** The catalog sets how long each source's item details may be kept after a list is archived (`tmdb-movie`: 183 days; community content: no limit). A daily scheduled function removes expired details (title replaced, subtitle and image cleared; identity, scores and ranks kept) and deletes leaderboard caches older than a day. Keep TMDB attribution in the UI.

## Licensing

The code is GPL-3.0-or-later (`LICENSE`). Content a community creates (lists, nominations, CSVs, scores) belongs to that community and is not covered by the code's license. TMDB data is used under TMDB's terms, with attribution wherever it appears. Keep the README's "License and content" section, the footer and the privacy page consistent with this.

## Environment

Everything that varies per deployment lives in env, and everything that varies per list lives in the List aggregate. `server/config.ts` validates env, and `server/composition.ts` is the only module in `src/` that reads `process.env`. A misconfigured deploy fails on its first request, and the function log lists every missing or malformed variable at once. [docs/discord-setup.md](docs/discord-setup.md) explains how to obtain each Discord value.

| Variable                                | Required         | Purpose                                                                                                                                                                                                                                                                                                              |
| --------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SITE_URL`                              | yes              | the site's public origin, e.g. `https://lists.example.org` (scheme and host, no path or trailing slash). Must be `https://`, except `http://localhost` for development. The single source for the OAuth redirect URI (`${SITE_URL}/api/auth/callback`) and the `Origin` check. Netlify's built-in `URL` is not used. |
| `DISCORD_CLIENT_ID`                     | yes              | Discord OAuth application                                                                                                                                                                                                                                                                                            |
| `DISCORD_CLIENT_SECRET`                 | yes              | Discord OAuth application (secret)                                                                                                                                                                                                                                                                                   |
| `DISCORD_GUILD_ID`                      | yes              | the community's Discord server; only its members can sign in                                                                                                                                                                                                                                                         |
| `ADMIN_ROLE_ID`                         | one of these two | Discord role whose holders are Admins                                                                                                                                                                                                                                                                                |
| `ADMIN_MEMBER_IDS`                      | one of these two | comma-separated Discord **user IDs** (never usernames, which can change hands) of members who are Admins whatever their roles, e.g. whoever runs the site. Evaluated on every request                                                                                                                                |
| `SESSION_SECRET`                        | yes              | HMAC key for session cookies (secret, at least 32 random bytes)                                                                                                                                                                                                                                                      |
| `TMDB_READ_TOKEN`                       | for `tmdb-movie` | TMDB API read token (secret). Without it, the `tmdb-movie` source is unavailable                                                                                                                                                                                                                                     |
| `BACKUP_KEY`                            | for backups      | at least 32 random characters (secret). Seals votes in backups and keys erasure fingerprints. Keep a copy: without the same key, votes in a backup can't be restored                                                                                                                                                 |
| `DEMO_MODE`                             | no               | `true` enables demo mode (pretend sign-in, sample lists) in previews, branch deploys and local dev. Ignored in production                                                                                                                                                                                            |
| `NETLIFY_SITE_ID`, `NETLIFY_AUTH_TOKEN` | seed script only | point `npm run seed` at the deployed site's data; never set on the site itself                                                                                                                                                                                                                                       |
| `VITE_SITE_NAME`                        | no               | display name of the site, default `Votable Lists`. Public, baked into the web build                                                                                                                                                                                                                                  |
| `VITE_SOURCE_URL`                       | no               | public link to the source code in the footer, default `https://github.com/mooeypoo/hivemind`; forks set their own                                                                                                                                                                                                    |
| `DISCORD_INVITE_CODE`                   | no               | a never-expiring invite (code or link). Shows the server's name and icon and a Join link; ignored if it belongs to another server                                                                                                                                                                                    |
| `COMMUNITY_NAME`                        | no               | the community's name, shown when there is no invite code or Discord can't be reached                                                                                                                                                                                                                                 |

`.env.example` lists the same variables and stays in sync with this table.

## Conventions

- **Use cases** are factories: `makeRateEntry(deps) => (actor, input) => Promise<Result<Output, DomainError>>`.
- **Domain errors** are returned as values, not thrown. `server/http` maps them to status codes.
- **Testing.** Domain and application tests use `InMemory*` adapters. Each Blobs repository gets one integration test against `@netlify/blobs/server`. Write a test first for every invariant listed above.
- **Definition of done.** `npm run check` (tsc, eslint, depcruise, vitest) is green, and the milestone works under `netlify dev`.

## Milestones

The privacy page describes exactly what the app stores. Any change to stored data updates it in the same change.

| Milestone | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Status |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| M0        | Skeleton, tooling, boundary rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | done   |
| M1        | Identity: Discord sign-in, sessions, Actor, my data                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | done   |
| M2        | Catalog and lists, with choosable item sources                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | done   |
| Web slice | Browser UI for identity and lists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | done   |
| M3        | Voting, with its rating UI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | done   |
| M4        | Ranking, with the leaderboard UI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | done   |
| M5        | Web polish and accessibility audit; **community badge** (Discord server name and icon from a public invite lookup, `DISCORD_INVITE_CODE`, falling back to a name setting); **footer** (community, credit to Moriel Schottlender linking to https://moriel.tech, source link to https://github.com/mooeypoo/hivemind, configurable for forks, and the license line: code GPL-3.0-or-later, community content belongs to the community, movie data under TMDB's terms); **privacy page** (what is stored and what never is, retention, and what Download and Delete my data do) | done   |
| M6        | Hardening and launch: rate limits, CSP check, retention purge, seed script, deploy previews                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | done   |
