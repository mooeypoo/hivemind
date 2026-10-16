import type { App } from '../../composition.ts';
import { actorOf } from '../auth.ts';
import { defined, listParam, readJson } from '../body.ts';
import type { BallotDto, PublicScoresDto } from '../contracts.ts';
import { rejectForeignOrigin } from '../origin.ts';
import { domainErrorResponse, json } from '../respond.ts';
import { changeScoreBody } from '../schemas.ts';

/** `GET /api/lists/:list/ballot` */
export const getMyBallot = async (request: Request, app: App): Promise<Response> => {
  const result = await app.voting.getMyBallot(await actorOf(request, app), {
    list: listParam(request),
  });
  if (!result.ok) return domainErrorResponse(result.error);
  const body: BallotDto = result.value;
  return json(body);
};

/** `PUT /api/lists/:list/ballot` */
export const changeScore = async (request: Request, app: App): Promise<Response> => {
  const rejected = rejectForeignOrigin(request, app.siteOrigin(request));
  if (rejected !== null) return rejected;
  const body = await readJson(request, changeScoreBody);
  if (!body.ok) return body.response;
  const result = await app.voting.changeScore(await actorOf(request, app), {
    list: listParam(request),
    ...defined(body.data),
  });
  if (!result.ok) return domainErrorResponse(result.error);
  const ballot: BallotDto = result.value;
  return json(ballot);
};

/** `GET /api/lists/:list/scores` */
export const getPublicScores = async (request: Request, app: App): Promise<Response> => {
  const result = await app.voting.getPublicScores(await actorOf(request, app), {
    list: listParam(request),
  });
  if (!result.ok) return domainErrorResponse(result.error);
  const body: PublicScoresDto = result.value;
  return json(body);
};
