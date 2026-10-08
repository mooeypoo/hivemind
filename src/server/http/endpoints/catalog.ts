import type { App } from '../../composition.ts';
import { actorOf } from '../auth.ts';
import { readJson } from '../body.ts';
import type { PresetImportedDto, SourcesDto } from '../contracts.ts';
import { rejectForeignOrigin } from '../origin.ts';
import { domainErrorResponse, json } from '../respond.ts';
import { importPresetBody } from '../schemas.ts';

/** `GET /api/catalog/sources` */
export const availableSources = async (request: Request, app: App): Promise<Response> => {
  const result = app.catalog.availableSources(await actorOf(request, app));
  if (!result.ok) return domainErrorResponse(result.error);
  const body: SourcesDto = { sources: result.value };
  return json(body);
};

/** `POST /api/catalog/presets` */
export const importPreset = async (request: Request, app: App): Promise<Response> => {
  const rejected = rejectForeignOrigin(request, app.config.siteUrl);
  if (rejected !== null) return rejected;
  const body = await readJson(request, importPresetBody);
  if (!body.ok) return body.response;
  const result = await app.catalog.importPreset(await actorOf(request, app), body.data);
  if (!result.ok) return domainErrorResponse(result.error);
  const imported: PresetImportedDto = result.value;
  return json(imported, 201);
};
