import { resolveItemForList, handle, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(resolveItemForList);

export const config: Config = {
  path: '/api/lists/:list/item',
  method: 'GET',
  rateLimit: rateLimits.search,
};
