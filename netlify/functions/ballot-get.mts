import { getMyBallot, handle, type Config } from '../../src/server/functions.ts';

export default handle(getMyBallot);

export const config: Config = { path: '/api/lists/:list/ballot', method: 'GET' };
