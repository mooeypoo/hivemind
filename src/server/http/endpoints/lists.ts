import type { DomainError, Result } from '../../../shared/kernel/index.ts';
import type { App } from '../../composition.ts';
import { actorOf } from '../auth.ts';
import { defined, listParam, parseWith, queryOf, readJson } from '../body.ts';
import type { ListDetailDto, ListDto, ListsDto, SearchResultsDto } from '../contracts.ts';
import { entryDto, listDetailDto, listDto } from '../mappers.ts';
import { rejectForeignOrigin } from '../origin.ts';
import { domainErrorResponse, json } from '../respond.ts';
import {
  createListBody,
  editListBody,
  nominateBody,
  scheduleBody,
  searchQuery,
} from '../schemas.ts';

const respond = <T>(result: Result<T, DomainError>, map: (value: T) => unknown, status = 200) =>
  result.ok ? json(map(result.value), status) : domainErrorResponse(result.error);

/** `GET /api/lists` */
export const listLists = async (request: Request, app: App): Promise<Response> =>
  respond(await app.lists.listLists(await actorOf(request, app)), (lists): ListsDto => ({
    lists: lists.map(listDto),
  }));

/** `GET /api/lists/:list` */
export const getList = async (request: Request, app: App): Promise<Response> =>
  respond(
    await app.lists.getList(await actorOf(request, app), { list: listParam(request) }),
    (detail): ListDetailDto => listDetailDto(detail),
  );

/** `POST /api/lists` */
export const createList = async (request: Request, app: App): Promise<Response> => {
  const rejected = rejectForeignOrigin(request, app.config.siteUrl);
  if (rejected !== null) return rejected;
  const body = await readJson(request, createListBody);
  if (!body.ok) return body.response;
  return respond(
    await app.lists.createList(await actorOf(request, app), body.data),
    (view): ListDto => listDto(view),
    201,
  );
};

/** `PUT /api/lists/:list` */
export const editList = async (request: Request, app: App): Promise<Response> => {
  const rejected = rejectForeignOrigin(request, app.config.siteUrl);
  if (rejected !== null) return rejected;
  const body = await readJson(request, editListBody);
  if (!body.ok) return body.response;
  return respond(
    await app.lists.editList(await actorOf(request, app), {
      list: listParam(request),
      edit: defined(body.data),
    }),
    (view): ListDto => listDto(view),
  );
};

/** `POST /api/lists/:list/schedule` */
export const scheduleList = async (request: Request, app: App): Promise<Response> => {
  const rejected = rejectForeignOrigin(request, app.config.siteUrl);
  if (rejected !== null) return rejected;
  const body = await readJson(request, scheduleBody);
  if (!body.ok) return body.response;
  return respond(
    await app.lists.scheduleList(await actorOf(request, app), {
      list: listParam(request),
      schedule: body.data,
    }),
    (view): ListDto => listDto(view),
  );
};

/** `POST /api/lists/:list/archive` */
export const archiveList = async (request: Request, app: App): Promise<Response> => {
  const rejected = rejectForeignOrigin(request, app.config.siteUrl);
  if (rejected !== null) return rejected;
  return respond(
    await app.lists.archiveList(await actorOf(request, app), { list: listParam(request) }),
    (view): ListDto => listDto(view),
  );
};

/** `GET /api/lists/:list/search?q=` */
export const searchForList = async (request: Request, app: App): Promise<Response> => {
  const query = parseWith(searchQuery, queryOf(request));
  if (!query.ok) return query.response;
  return respond(
    await app.lists.searchForList(await actorOf(request, app), {
      list: listParam(request),
      query: query.data.q,
    }),
    (items): SearchResultsDto => ({ items }),
  );
};

/** `POST /api/lists/:list/entries` */
export const nominate = async (request: Request, app: App): Promise<Response> => {
  const rejected = rejectForeignOrigin(request, app.config.siteUrl);
  if (rejected !== null) return rejected;
  const body = await readJson(request, nominateBody);
  if (!body.ok) return body.response;
  return respond(
    await app.lists.nominate(await actorOf(request, app), {
      list: listParam(request),
      key: 'externalId' in body.data ? body.data.externalId : body.data.title,
    }),
    entryDto,
    201,
  );
};
