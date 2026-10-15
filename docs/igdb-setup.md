# IGDB game lists

IGDB is an optional catalog source, independent of TMDB and TheTVDB. An Admin can choose
**Games (IGDB)** when creating a list only when both credentials below are configured.
If either is missing or empty, game lists are not offered and new IGDB lists are refused.
Existing game entries remain readable from their saved snapshots.

## Usage rights

The [IGDB API documentation](https://api-docs.igdb.com/) offers free access for
**non-commercial use**, under the
[Twitch Developer Services Agreement](https://www.twitch.tv/p/en/legal/developer-agreement/).
Commercial deployments must arrange appropriate permission with IGDB before enabling it.
The deployment operator is responsible for confirming the current access, attribution,
artwork, storage and retention rights for their use. The software's GPL license does not
license IGDB data or game artwork.

The app credits IGDB on game list and results pages and, when the source is enabled, in
the footer, About and Privacy pages. Keep these credits in forks.

## Obtain credentials

1. Sign in to the [Twitch Developer Console](https://dev.twitch.tv/console/apps) and enable
   two-factor authentication on your Twitch account if needed.
2. Register an application. This integration uses server-to-server client credentials,
   not members' Twitch accounts or a browser redirect.
3. Copy its **Client ID** and generate a **Client Secret**.
4. Set the following in your local `.env`, or in Netlify's server-side environment settings
   for each deployment context that should offer games:

   ```dotenv
   IGDB_CLIENT_ID=
   IGDB_CLIENT_SECRET=
   ```

5. Restart local development or redeploy. Create a list with **Games (IGDB)** as an Admin.

These values are application credentials, **not a pre-issued bearer access token**.
Do not put them in `VITE_*` variables, a browser bundle or source control.
The server exchanges them with Twitch for an app access token, keeps it in memory per warm
function instance, renews before expiry and retries authentication once on an API 401.
Neither credentials nor tokens are returned to the browser or written to Blobs.

## Data and limits

- Searches return up to 20 games with a cover, synopsis, release year, and developer and
  publisher companies where IGDB provides them. Missing details stay absent.
- Reviewing a result fetches current details. Nomination fetches them again, so the saved
  entry is validated by IGDB rather than trusting browser-supplied metadata.
- Nominated metadata is snapshotted in lists and included in backups. No automatic IGDB
  snapshot expiry is configured; snapshots remain after archive. Confirm that this suits
  your usage rights before enabling the integration.
- Only IGDB's `images.igdb.com` host is allowed for covers. Browsers request those images
  directly, so that service receives the viewer's IP address. Searches and selected IDs
  go through the server, without Discord identities or scores.
- IGDB limits a credential to **4 requests per second** and **8 open requests**. This adapter
  spaces requests within each warm instance, but Netlify runs multiple functions/instances,
  so it cannot enforce a deployment-wide limit. Shared credentials or bursts can still hit
  the upstream quota. Rate-limit, authentication, timeout and malformed-response failures
  surface as `catalog.upstream-unavailable`; they are not shown as empty search results.
- The existing movie/TV metadata refresh operation does not apply to game lists.

References: [IGDB API](https://api-docs.igdb.com/),
[Twitch client credentials](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow).
