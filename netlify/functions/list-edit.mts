import { editList, handle, type Config } from '../../src/server/functions.ts';

export default handle(editList);

export const config: Config = { path: '/api/lists/:list', method: 'PUT' };
