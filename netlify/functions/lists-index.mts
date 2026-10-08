import { listLists, handle, type Config } from '../../src/server/functions.ts';

export default handle(listLists);

export const config: Config = { path: '/api/lists', method: 'GET' };
