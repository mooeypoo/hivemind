import { exportBackup, handle, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(exportBackup);

export const config: Config = {
  path: '/api/admin/backup',
  method: 'GET',
  rateLimit: rateLimits.mutation,
};
