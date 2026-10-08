import { getList, handle, type Config } from '../../src/server/functions.ts';

export default handle(getList);

export const config: Config = { path: '/api/lists/:list', method: 'GET' };
