import { getRoleLabels, handle, type Config } from '../../src/server/functions.ts';

export default handle(getRoleLabels);

export const config: Config = { path: '/api/roles', method: 'GET' };
