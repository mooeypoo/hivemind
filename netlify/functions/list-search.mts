import { searchForList, handle, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(searchForList);

export const config: Config = {
  path: '/api/lists/:list/search',
  method: 'GET',
  rateLimit: rateLimits.search,
};
