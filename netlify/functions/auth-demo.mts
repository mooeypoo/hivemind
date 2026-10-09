import { demoSignIn, handle, rateLimits, type Config } from '../../src/server/functions.ts';

export default handle(demoSignIn);

export const config: Config = {
  path: '/api/auth/demo',
  method: 'POST',
  rateLimit: rateLimits.signIn,
};
