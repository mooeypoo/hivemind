import { createList, handle, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(createList);

export const config: Config = {
  path: '/api/lists',
  method: 'POST',
  rateLimit: rateLimits.mutation,
};
