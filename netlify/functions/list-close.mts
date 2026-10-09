import { closeVoting, handle, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(closeVoting);

export const config: Config = {
  path: '/api/lists/:list/close',
  method: 'POST',
  rateLimit: rateLimits.mutation,
};
