import { deleteList, handle, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(deleteList);

export const config: Config = {
  path: '/api/lists/:list',
  method: 'DELETE',
  rateLimit: rateLimits.mutation,
};
