import type { App } from '../../composition.ts';
import { actorOf } from '../auth.ts';
import { readJson } from '../body.ts';
import type { RoleLabelsDto, SiteDto } from '../contracts.ts';
import { rejectForeignOrigin } from '../origin.ts';
import { domainErrorResponse, json } from '../respond.ts';
import { saveRoleLabelsBody } from '../schemas.ts';

/** `GET /api/site`. Public, and the same for everyone, so it may be cached. */
export const getSite = async (_request: Request, app: App): Promise<Response> => {
  const body: SiteDto = {
    community: await app.identity.getCommunity(),
    offersMovieData: app.config.tmdbReadToken !== null,
    offersTvData: app.config.tvdbReadToken !== null,
    offersGameData: app.config.igdb !== null,
    demo: app.demo,
    backups: app.backupsEnabled,
  };
  return json(body, 200, new Headers({ 'Cache-Control': 'public, max-age=3600' }));
};

/** `GET /api/roles` */
export const getRoleLabels = async (request: Request, app: App): Promise<Response> => {
  const result = await app.identity.getRoleLabels(await actorOf(request, app));
  if (!result.ok) return domainErrorResponse(result.error);
  const body: RoleLabelsDto = result.value;
  return json(body);
};

/** `PUT /api/roles` */
export const saveRoleLabels = async (request: Request, app: App): Promise<Response> => {
  const rejected = rejectForeignOrigin(request, app.siteOrigin(request));
  if (rejected !== null) return rejected;
  const body = await readJson(request, saveRoleLabelsBody);
  if (!body.ok) return body.response;
  const result = await app.identity.saveRoleLabels(await actorOf(request, app), body.data);
  if (!result.ok) return domainErrorResponse(result.error);
  const saved: RoleLabelsDto = result.value;
  return json(saved);
};
