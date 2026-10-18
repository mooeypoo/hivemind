import type { App } from '../../composition.ts';
import { actorOf } from '../auth.ts';
import { defined, parseWith, queryOf } from '../body.ts';
import type { InsightsDto } from '../contracts.ts';
import { domainErrorResponse, json } from '../respond.ts';
import { insightsQuery } from '../schemas.ts';

export const getInsights = async (request: Request, app: App): Promise<Response> => {
  const query = parseWith(insightsQuery, queryOf(request));
  if (!query.ok) return query.response;
  const result = await app.insights.getInsights(await actorOf(request, app), defined(query.data));
  return result.ok ? json(result.value satisfies InsightsDto) : domainErrorResponse(result.error);
};
