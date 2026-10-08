# Votable Lists

Members of a Discord server create ranked lists ("Best sci-fi movies"), nominate items into them, and rate those items. Each list ranks itself.

One deployment serves one Discord community. To run it for your own community, fork the repository and deploy your fork. Nothing community-specific lives in the code.

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

## Architecture

[AGENTS.md](AGENTS.md) is the architecture contract: the bounded contexts, the dependency rules (enforced by dependency-cruiser), the domain invariants, and the security and privacy requirements. Read it before changing code.
