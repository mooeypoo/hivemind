import { importPreset, handle, type Config } from '../../src/server/functions.ts';

export default handle(importPreset);

export const config: Config = { path: '/api/catalog/presets', method: 'POST' };
