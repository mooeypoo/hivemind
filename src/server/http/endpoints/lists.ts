import type { DomainError, Result } from '../../../shared/kernel/index.ts';
import type { App } from '../../composition.ts';
import { actorOf } from '../auth.ts';
import { defined, listParam, parseWith, queryOf, readJson } from '../body.ts';
import type {
  ListDetailDto,
  ListDto,
  ListsDto,
  CatalogItemDto,
  RefreshMovieDetailsDto,
  SearchResultsDto,
} from '../contracts.ts';
import { entryDto, listDetailDto, listDto } from '../mappers.ts';
import { rejectForeignOrigin } from '../origin.ts';
import { domainErrorResponse, json, noContent } from '../respond.ts';
import {
  createListBody,
  deleteListBody,
  deleteEntryBody,
  editListBody,
  nominateBody,
  refreshDetailsQuery,
  resolveItemQuery,
  scheduleBody,
  searchQuery,
  scoreVisibilityBody,
  visibilityBody,
  withdrawNominationBody,
} from '../schemas.ts';

const respond = <T>(result: Result<T, DomainError>, map: (value: T) => unknown, status = 200) =>
  result.ok ? json(map(result.value), status) : domainErrorResponse(result.error);

/** `POST /api/lists/:list/entries/delete` — immutable list ID and entry incarnation. */
export const deleteEntry = async (request: Request, app: App): Promise<Response> => {
  const rejected = rejectForeignOrigin(request, app.siteOrigin(request));
  if (rejected !== null) return rejected;
  const body = await readJson(request, deleteEntryBody);
  if (!body.ok) return body.response;
  const result = await app.deleteEntry(await actorOf(request, app), {
    listId: listParam(request),
    ...body.data,
  });
  return result.ok ? noContent() : domainErrorResponse(result.error);
};

/** `DELETE /api/lists/:list` — immutable list ID only, never a reusable slug. */
export const deleteList = async (request: Request, app: App): Promise<Response> => {
  const rejected = rejectForeignOrigin(request, app.siteOrigin(request));
  if (rejected !== null) return rejected;
  const body = await readJson(request, deleteListBody);
  if (!body.ok) return body.response;
  const result = await app.deleteList(await actorOf(request, app), {
    listId: listParam(request),
    confirmation: body.data.confirmation,
  });
  return result.ok ? noContent() : domainErrorResponse(result.error);
};

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
  const rejected = rejectForeignOrigin(request, app.siteOrigin(request));
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
  const rejected = rejectForeignOrigin(request, app.siteOrigin(request));
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
  const rejected = rejectForeignOrigin(request, app.siteOrigin(request));
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
  const rejected = rejectForeignOrigin(request, app.siteOrigin(request));
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

/** `GET /api/lists/:list/item?externalId=` */
export const resolveItemForList = async (request: Request, app: App): Promise<Response> => {
  const query = parseWith(resolveItemQuery, queryOf(request));
  if (!query.ok) return query.response;
  return respond(
    await app.lists.resolveItemForList(await actorOf(request, app), {
      list: listParam(request),
      externalId: query.data.externalId,
    }),
    (item): CatalogItemDto => item,
  );
};

/** `POST /api/lists/:list/entries` */
export const nominate = async (request: Request, app: App): Promise<Response> => {
  const rejected = rejectForeignOrigin(request, app.siteOrigin(request));
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

export const withdrawNomination = async (request: Request, app: App): Promise<Response> => {
  const rejected = rejectForeignOrigin(request, app.siteOrigin(request));
  if (rejected !== null) return rejected;
  const body = await readJson(request, withdrawNominationBody);
  if (!body.ok) return body.response;
  const result = await app.lists.withdrawNomination(await actorOf(request, app), {
    list: listParam(request),
    ...body.data,
  });
  return result.ok
    ? new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
    : domainErrorResponse(result.error);
};

/** `POST /api/lists/:list/refresh-movie-details?after=` */
export const refreshMovieDetails = async (request: Request, app: App): Promise<Response> => {
  const rejected = rejectForeignOrigin(request, app.siteOrigin(request));
  if (rejected !== null) return rejected;
  const query = parseWith(refreshDetailsQuery, queryOf(request));
  if (!query.ok) return query.response;
  return respond(
    await app.lists.refreshMovieDetails(await actorOf(request, app), {
      list: listParam(request),
      ...(query.data.after === undefined ? {} : { after: query.data.after }),
    }),
    (result): RefreshMovieDetailsDto => result,
  );
};

/** `POST /api/lists/:list/close` */
export const closeVoting = async (request: Request, app: App): Promise<Response> => {
  const rejected = rejectForeignOrigin(request, app.siteOrigin(request));
  if (rejected !== null) return rejected;
  return respond(
    await app.lists.closeVoting(await actorOf(request, app), { list: listParam(request) }),
    (view): ListDto => listDto(view),
  );
};

/** `PUT /api/lists/:list/visibility` */
export const setVisibility = async (request: Request, app: App): Promise<Response> => {
  const rejected = rejectForeignOrigin(request, app.siteOrigin(request));
  if (rejected !== null) return rejected;
  const body = await readJson(request, visibilityBody);
  if (!body.ok) return body.response;
  return respond(
    await app.lists.setVisibility(await actorOf(request, app), {
      list: listParam(request),
      visibility: body.data.visibility,
    }),
    (view): ListDto => listDto(view),
  );
};

/** `PUT /api/lists/:list/score-visibility` */
export const setScoreVisibility = async (request: Request, app: App): Promise<Response> => {
  const rejected = rejectForeignOrigin(request, app.siteOrigin(request));
  if (rejected !== null) return rejected;
  const body = await readJson(request, scoreVisibilityBody);
  if (!body.ok) return body.response;
  return respond(
    await app.lists.setScoreVisibility(await actorOf(request, app), {
      list: listParam(request),
      scoreVisibility: body.data.scoreVisibility,
    }),
    (view): ListDto => listDto(view),
  );
};
