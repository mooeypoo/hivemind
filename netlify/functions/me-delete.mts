import { deleteMyData, handle, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(deleteMyData);

export const config: Config = { path: '/api/me', method: 'DELETE', rateLimit: rateLimits.mutation };
