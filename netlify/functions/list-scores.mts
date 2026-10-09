import { getPublicScores, handle, type Config } from '../../src/server/functions.ts';

export default handle(getPublicScores);

export const config: Config = { path: '/api/lists/:list/scores', method: 'GET' };
