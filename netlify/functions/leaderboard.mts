import { getLeaderboard, handle, type Config } from '../../src/server/functions.ts';

export default handle(getLeaderboard);

export const config: Config = { path: '/api/lists/:list/leaderboard', method: 'GET' };
