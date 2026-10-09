import { authLogin, handle, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(authLogin);

export const config: Config = {
  path: '/api/auth/login',
  method: 'GET',
  rateLimit: rateLimits.signIn,
};
