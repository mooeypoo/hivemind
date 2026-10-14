# TheTVDB Setup

TV show lists search [TheTVDB](https://thetvdb.com/). Set `TVDB_READ_TOKEN` to offer
the `tvdb-series` source. Without it, TVDB is unavailable for new lists; movie,
free-text and CSV sources work independently. `TMDB_READ_TOKEN` controls only movies.

## Access And Licensing

Register a key from [your TVDB account](https://www.thetvdb.com/dashboard/account/apikey).
Confirm that its license permits this server to provide metadata and artwork to your
community. A working credential alone does not establish permission to redistribute
data. TVDB describes licensed and subscriber-supported access models in its
[API documentation repository](https://github.com/thetvdb/v4-api).

This integration uses one deployment-wide credential. It does not collect members'
TVDB accounts, subscriptions or PINs. Subscriber-supported keys requiring each user's
PIN are not supported. Use a key licensed for server-side community access.

## Configure The Source

1. Set `TVDB_READ_TOKEN` in your local `.env` or Netlify environment settings. Never
   put it in a `VITE_*` variable or commit it to the repository.
2. Prefer a v4 **API key**. The server exchanges it at `/v4/login`, shares the result
   between concurrent requests, and renews it before its one-month expiration or
   once after an unauthorized response.
3. A pre-issued JWT **bearer token** also works, but cannot be renewed without its
   API key. Replace it and redeploy before it expires, or use the API key instead.
4. Restart local development or redeploy. Admins can select **TV shows (TheTVDB)**
   when creating a list.

Availability depends on a nonblank environment value, not a startup API call. Invalid,
expired, rate-limited or unreachable credentials produce the catalog's standard
unavailable response when searching or reviewing a show. No credentials leave the server.

## Data And Attribution

Search is restricted to series, not movies, episodes or people. Reviewing a result
loads its extended details; nomination fetches them again and stores a snapshot with
the title, year, poster address, synopsis, creators and up to two cast members where
provided. The browser displays **Created by**, never **Director**, for creator credits.
TVDB's coverage varies: some series have no creator records, synopsis or artwork.
Missing fields are omitted, not inferred from writers or directors.

Series IDs have their own `tvdb-series` namespace, so they cannot collide with movie
IDs. The existing nomination, rating, ranking, withdrawal and backup behavior applies.
Only HTTPS images from `artworks.thetvdb.com` are accepted; this host is explicitly
allowed by the site's CSP. Searches run server-side without member identities or
scores; browsers request artwork directly from TVDB, exposing their IP address to it.

TheTVDB is credited on list and results pages, and in the footer, About and Privacy
pages when enabled. TVDB data and artwork are separate from the software's GPL license.
The integration keeps nominated series snapshots with the list, including after
archiving; unlike TMDB it sets no automatic six-month purge. Confirm retention and
attribution requirements against your TVDB agreement before enabling it in production.
