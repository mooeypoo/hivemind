import { getAdminActivity, handle, type Config } from '../../src/server/functions.ts';

export default handle(getAdminActivity);

export const config: Config = { path: '/api/admin/activity', method: 'GET' };
