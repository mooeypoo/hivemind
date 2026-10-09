/**
 * The only module `netlify/functions` imports. Each function is
 * `export default handle(endpoint)` plus its route `config`.
 */
import { getApp, type App } from './composition.ts';
import { runRetention } from './jobs.ts';
import { errorBody, json } from './http/respond.ts';

import type { Context } from '@netlify/functions';

export type { Config } from '@netlify/functions';
export { authCallback, authLogin, authLogout, demoSignIn } from './http/endpoints/auth.ts';
export { deleteMyData, exportMyData, getMe } from './http/endpoints/me.ts';
export { availableSources, importPreset } from './http/endpoints/catalog.ts';
export { changeScore, getMyBallot } from './http/endpoints/voting.ts';
export { getLeaderboard } from './http/endpoints/ranking.ts';
export { getRoleLabels, getSite, saveRoleLabels } from './http/endpoints/site.ts';
export {
  archiveList,
  createList,
  editList,
  getList,
  listLists,
  nominate,
  scheduleList,
  searchForList,
} from './http/endpoints/lists.ts';

/**
 * Netlify's function-level rate limits (AGENTS.md: on search and on every mutation), per
 * client IP and per site domain, over a 60-second window. One place, so they stay consistent.
 */
export const rateLimits = {
  /** Anything that changes data. */
  mutation: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] },
  /** Search calls TMDB on the member's behalf. */
  search: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
  /** Sign-in, including demo sign-in. */
  signIn: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] },
} satisfies Record<
  string,
  { windowLimit: number; windowSize: number; aggregateBy: ('ip' | 'domain')[] }
>;

export type Endpoint = (request: Request, app: App) => Promise<Response>;

/** Adapts an endpoint to a Netlify function. Unexpected failures become a bare 500. */
export const handle =
  (endpoint: Endpoint) =>
  async (request: Request, context?: Context): Promise<Response> => {
    try {
      return await endpoint(request, getApp(context?.deploy.context));
    } catch (error) {
      // AGENTS.md: never log tokens, cookies or request bodies. Route and error only;
      // our own error messages never contain secrets.
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error';
      console.error(
        `Unhandled error in ${request.method} ${new URL(request.url).pathname}: ${detail}`,
      );
      return json(errorBody('http.internal', 'Something went wrong.'), 500);
    }
  };

/** The daily retention job, as a Netlify scheduled function (no route, no request body). */
export const retention = async (_request: Request, context?: Context): Promise<Response> => {
  console.log(await runRetention(getApp(context?.deploy.context)));
  return new Response(null, { status: 204 });
};
