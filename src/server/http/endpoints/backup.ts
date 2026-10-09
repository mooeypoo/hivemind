import type { App } from '../../composition.ts';
import { actorOf } from '../auth.ts';
import { readJson } from '../body.ts';
import type { ImportSummaryDto } from '../contracts.ts';
import { rejectForeignOrigin } from '../origin.ts';
import { domainErrorResponse, json } from '../respond.ts';
import { BACKUP_MAX_BYTES, backupFileBody } from '../schemas.ts';

/** `GET /api/admin/backup?list=<id or slug>`, or without `list` for every list. */
export const exportBackup = async (request: Request, app: App): Promise<Response> => {
  const list = new URL(request.url).searchParams.get('list');
  const result = await app.backup.exportLists(await actorOf(request, app), {
    list: list === null || list === '' || list === 'all' ? null : list,
  });
  if (!result.ok) return domainErrorResponse(result.error);
  const date = result.value.exportedAt.slice(0, 10);
  const name =
    list === null || list === 'all'
      ? 'all-lists'
      : (result.value.lists[0]?.list.config.slug ?? 'list');
  return json(
    result.value,
    200,
    new Headers({
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="votable-lists-backup-${name}-${date}.json"`,
    }),
  );
};

/** `POST /api/admin/backup`: import a backup file. Never overwrites existing lists. */
export const importBackup = async (request: Request, app: App): Promise<Response> => {
  const rejected = rejectForeignOrigin(request, app.siteOrigin(request));
  if (rejected !== null) return rejected;
  const body = await readJson(request, backupFileBody, BACKUP_MAX_BYTES);
  if (!body.ok) return body.response;
  const result = await app.backup.importLists(await actorOf(request, app), body.data);
  if (!result.ok) return domainErrorResponse(result.error);
  const summary: ImportSummaryDto = result.value;
  return json(summary);
};
