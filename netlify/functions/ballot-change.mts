import { changeScore, handle, type Config } from '../../src/server/functions.ts';

export default handle(changeScore);

export const config: Config = { path: '/api/lists/:list/ballot', method: 'PUT' };
