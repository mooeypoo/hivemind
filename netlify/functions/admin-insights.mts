import { getInsights, handle, type Config } from '../../src/server/functions.ts';

export default handle(getInsights);

export const config: Config = { path: '/api/admin/insights', method: 'GET' };
