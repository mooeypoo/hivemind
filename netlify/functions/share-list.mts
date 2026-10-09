import { handle, sharePage, type Config } from '../../src/server/functions.ts';

export default handle(sharePage);

export const config: Config = { path: '/lists/:slug', method: 'GET' };
