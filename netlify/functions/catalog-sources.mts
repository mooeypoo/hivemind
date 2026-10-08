import { availableSources, handle, type Config } from '../../src/server/functions.ts';

export default handle(availableSources);

export const config: Config = { path: '/api/catalog/sources', method: 'GET' };
