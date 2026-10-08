import { authLogout, handle, type Config } from '../../src/server/functions.ts';

export default handle(authLogout);

export const config: Config = { path: '/api/auth/logout', method: 'POST' };
