import { getMe, handle, type Config } from '../../src/server/functions.ts';

export default handle(getMe);

export const config: Config = { path: '/api/me', method: 'GET' };
