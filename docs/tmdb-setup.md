# TMDB setup (optional)

Movie lists search [The Movie Database (TMDB)](https://www.themoviedb.org/). You need a TMDB token only if you want lists with the `tmdb-movie` item source. Without one, that source simply isn't offered, and free-text and CSV lists still work.

## Get a read access token

1. Create a free account at [themoviedb.org](https://www.themoviedb.org/signup) and verify your email.
2. Open **Settings → API** and request an API key. Choose the **Developer** type and describe the site as a non-commercial community project.
3. On the same page, copy the **API Read Access Token**. It's the long token, not the shorter "API Key". This is `TMDB_READ_TOKEN`.
4. Put it in `.env` for local development, and in Netlify's environment variables, marked as secret, for the deployed site.

The token can only read public movie data. It never sees anything about your members.

## What the site does with it

- **Searching:** when a member nominates, the site searches TMDB for movies. Adult titles are always excluded.
- **Validating:** a nominated movie is re-fetched from TMDB, so only real movies get in.
- **Storing:** the list keeps a snapshot of each nominated movie (title, year, poster address). Posters load from `image.tmdb.org`, which the site's Content Security Policy allows.

## TMDB's terms

- **Attribution:** the site shows TMDB attribution wherever movie data appears, as TMDB requires.
- **Data retention:** movie snapshots on archived lists are purged after 6 months, per TMDB's caching terms.
