import { setVisibility, handle, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(setVisibility);

export const config: Config = {
  path: '/api/lists/:list/visibility',
  method: 'PUT',
  rateLimit: rateLimits.mutation,
};
