import { exportMyData, handle, type Config } from '../../src/server/functions.ts';

export default handle(exportMyData);

export const config: Config = { path: '/api/me/export', method: 'GET' };
