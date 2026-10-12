import { withdrawNomination, handle, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(withdrawNomination);

export const config: Config = {
  path: '/api/lists/:list/entries/withdraw',
  method: 'POST',
  rateLimit: rateLimits.mutation,
};
