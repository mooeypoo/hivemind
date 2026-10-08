import { nominate, handle, type Config } from '../../src/server/functions.ts';

export default handle(nominate);

export const config: Config = { path: '/api/lists/:list/entries', method: 'POST' };
