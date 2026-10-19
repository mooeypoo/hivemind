import { changeAccess, handle, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(changeAccess);

export const config: Config = {
  path: '/api/lists/:list/access',
  method: 'PUT',
  rateLimit: rateLimits.mutation,
};
