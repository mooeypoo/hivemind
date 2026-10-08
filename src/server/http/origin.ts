import { errorBody, json } from './respond.ts';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * AGENTS.md: a mutation must carry an `Origin` header equal to `SITE_URL`.
 * Returns the rejection to send, or null when the request may proceed.
 */
export const rejectForeignOrigin = (request: Request, siteUrl: string): Response | null => {
  if (!MUTATING.has(request.method)) return null;
  if (request.headers.get('origin') === siteUrl) return null;
  return json(errorBody('http.bad-origin', 'This request must come from the site itself.'), 403);
};
