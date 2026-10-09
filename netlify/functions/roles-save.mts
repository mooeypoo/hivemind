import { saveRoleLabels, handle, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(saveRoleLabels);

export const config: Config = { path: '/api/roles', method: 'PUT', rateLimit: rateLimits.mutation };
