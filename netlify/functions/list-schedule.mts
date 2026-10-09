import { scheduleList, handle, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(scheduleList);

export const config: Config = {
  path: '/api/lists/:list/schedule',
  method: 'POST',
  rateLimit: rateLimits.mutation,
};
