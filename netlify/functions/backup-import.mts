import { importBackup, handle, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(importBackup);

export const config: Config = {
  path: '/api/admin/backup',
  method: 'POST',
  rateLimit: rateLimits.mutation,
};
