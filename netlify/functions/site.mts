import { getSite, handle, type Config } from '../../src/server/functions.ts';

export default handle(getSite);

export const config: Config = { path: '/api/site', method: 'GET' };
