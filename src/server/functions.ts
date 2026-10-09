/**
 * The only module `netlify/functions` imports. Each function is
 * `export default handle(endpoint)` plus its route `config`.
 */
import { getApp, type App } from './composition.ts';
import { errorBody, json } from './http/respond.ts';

export type { Config } from '@netlify/functions';
export { authCallback, authLogin, authLogout } from './http/endpoints/auth.ts';
export { deleteMyData, exportMyData, getMe } from './http/endpoints/me.ts';
export { availableSources, importPreset } from './http/endpoints/catalog.ts';
export { changeScore, getMyBallot } from './http/endpoints/voting.ts';
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

export type Endpoint = (request: Request, app: App) => Promise<Response>;

/** Adapts an endpoint to a Netlify function. Unexpected failures become a bare 500. */
export const handle =
  (endpoint: Endpoint) =>
  async (request: Request): Promise<Response> => {
    try {
      return await endpoint(request, getApp());
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
