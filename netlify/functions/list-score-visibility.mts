import { setScoreVisibility, handle, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(setScoreVisibility);

export const config: Config = {
  path: '/api/lists/:list/score-visibility',
  method: 'PUT',
  rateLimit: rateLimits.mutation,
};
