import { saveRoleLabels, handle, type Config } from '../../src/server/functions.ts';

export default handle(saveRoleLabels);

export const config: Config = { path: '/api/roles', method: 'PUT' };
