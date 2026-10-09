# hivemind

hivemind is a platform for members of a Discord community to create ranked lists, nominate items, and rate them. Each deployment has its own site name, configured with `VITE_SITE_NAME` in its environment; if unset, the site is called hivemind.

Each list ranks itself. One deployment serves one Discord community. To run hivemind for your own community, fork the repository and deploy your fork. Nothing community-specific lives in the code.

## Deploy your own

1. **Discord application.** Follow [docs/discord-setup.md](docs/discord-setup.md) to register the app, choose your `SITE_URL`, and collect your server and admin role IDs.
2. **Netlify site.** Create a site from your fork. The build settings come from `netlify.toml`.
3. **Environment.** In the Netlify site settings, set the variables listed in `.env.example`, including `SITE_URL`. If you later move to a custom domain, update `SITE_URL` and the Discord redirect URI together. The Environment section of [AGENTS.md](AGENTS.md) describes each one. You only need `TMDB_READ_TOKEN` if you want movie lists; [docs/tmdb-setup.md](docs/tmdb-setup.md) explains how to get one.
4. **Deploy.** Members of your Discord server can now sign in. Admins, meaning holders of the `ADMIN_ROLE_ID` role plus anyone listed in `ADMIN_MEMBER_IDS`, can create lists.

## Develop

Requires Node 22 (see `.nvmrc`).

```sh
npm install
cp .env.example .env   # fill in the values
npm run dev            # netlify dev: web app + functions
npm run check          # typecheck, lint, boundary rules, formatting, tests
```

## Demo mode and previews

With `DEMO_MODE=true` (set in `.env.example`), local dev and Netlify deploy previews show **Try as Demo Admin / Member A / Member B** buttons and a set of sample lists, so the site can be explored without Discord. To enable it on previews, set `DEMO_MODE=true` for the _Deploy previews_ context in Netlify's environment variables. It never runs in production, even if set there, and previews use their own empty data, never the real lists.

## Operations

- `npm run seed` creates the first list, "Best Sci-Fi Movies" (TMDB, 1–10), as a draft. Locally it writes to `netlify dev`'s data; with `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN` (a personal access token) set, to the deployed site. Running it again does nothing.
- `npm run check:headers -- https://your-site.netlify.app` checks a deployed site's security headers. A GitHub Action runs it after every Netlify deploy.
- **Backups:** set `BACKUP_KEY` and Admins can download and import lists from **Backups** in the account menu. Votes stay sealed inside the file, members who deleted their data are never restored, and imports never overwrite. Keep the key safe: without it, votes in a backup can't be restored.
- A daily scheduled function removes movie details from lists archived more than 6 months ago, as TMDB's terms require.

## Architecture

[AGENTS.md](AGENTS.md) is the architecture contract: the bounded contexts, the dependency rules (enforced by dependency-cruiser), the domain invariants, and the security and privacy requirements. Read it before changing code.

## License and content

- **Code.** Copyright © Moriel Schottlender ([moriel.tech](https://moriel.tech)). Licensed under the GNU General Public License, version 3 or (at your option) any later version; see [LICENSE](LICENSE). If you run a modified version for others, the GPL requires you to share your changes under the same license.
- **Community content.** The lists, nominations, descriptions, imported CSVs and scores that a community creates belong to that community and its members. They are not part of this software and are not covered by its license.
- **Movie data.** Titles, years and posters come from [TMDB](https://www.themoviedb.org/) and are used under [TMDB's terms of use](https://www.themoviedb.org/api-terms-of-use). This product uses the TMDB API but is not endorsed or certified by TMDB.
