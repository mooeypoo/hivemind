import { handle, setEntryAside, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(setEntryAside);
export const config: Config = {
  path: '/api/lists/:list/entries/set-aside',
  method: 'PUT',
  rateLimit: rateLimits.mutation,
};
