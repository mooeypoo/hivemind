import { retention, type Config } from '../../src/server/functions.ts';

export default retention;

export const config: Config = { schedule: '@daily' };
