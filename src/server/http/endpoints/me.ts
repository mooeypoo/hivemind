import type { App } from '../../composition.ts';
import { actorOf } from '../auth.ts';
import { clearCookie, SESSION_COOKIE } from '../cookies.ts';
import type { MeDto, MyDataExportDto } from '../contracts.ts';
import { rejectForeignOrigin } from '../origin.ts';
import { domainErrorResponse, json, noContent, withCookies } from '../respond.ts';

/** `GET /api/me` */
export const getMe = async (request: Request, app: App): Promise<Response> => {
  const result = await app.identity.getMe(await actorOf(request, app));
  if (!result.ok) return domainErrorResponse(result.error);
  const body: MeDto = result.value;
  return json(body);
};

/** `GET /api/me/export` */
export const exportMyData = async (request: Request, app: App): Promise<Response> => {
  const result = await app.identity.exportMyData(await actorOf(request, app));
  if (!result.ok) return domainErrorResponse(result.error);
  const body: MyDataExportDto = result.value;
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Disposition': 'attachment; filename="my-data.json"',
  });
  return json(body, 200, headers);
};

/** `DELETE /api/me` */
export const deleteMyData = async (request: Request, app: App): Promise<Response> => {
  const rejected = rejectForeignOrigin(request, app.siteOrigin(request));
  if (rejected !== null) return rejected;
  const result = await app.identity.deleteMyData(await actorOf(request, app));
  if (!result.ok) return domainErrorResponse(result.error);
  return noContent(withCookies(clearCookie(SESSION_COOKIE)));
};
