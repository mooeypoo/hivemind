import { editList, handle, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(editList);

export const config: Config = {
  path: '/api/lists/:list',
  method: 'PUT',
  rateLimit: rateLimits.mutation,
};
