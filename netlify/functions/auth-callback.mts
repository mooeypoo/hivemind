import { authCallback, handle, type Config } from '../../src/server/functions.ts';

export default handle(authCallback);

export const config: Config = { path: '/api/auth/callback', method: 'GET' };
