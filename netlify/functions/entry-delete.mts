import { deleteEntry, handle, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(deleteEntry);

export const config: Config = {
  path: '/api/lists/:list/entries/delete',
  method: 'POST',
  rateLimit: rateLimits.mutation,
};
