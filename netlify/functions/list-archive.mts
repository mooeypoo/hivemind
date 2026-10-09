import { archiveList, handle, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(archiveList);

export const config: Config = {
  path: '/api/lists/:list/archive',
  method: 'POST',
  rateLimit: rateLimits.mutation,
};
