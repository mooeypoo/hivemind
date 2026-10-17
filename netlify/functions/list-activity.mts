import { getListActivity, handle, type Config } from '../../src/server/functions.ts';

export default handle(getListActivity);

export const config: Config = { path: '/api/lists/:list/activity', method: 'GET' };
