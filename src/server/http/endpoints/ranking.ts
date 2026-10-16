import type { App } from '../../composition.ts';
import { actorOf } from '../auth.ts';
import { listParam } from '../body.ts';
import type { LeaderboardDto, LeaderboardRowDto } from '../contracts.ts';
import { domainErrorResponse, json } from '../respond.ts';

const round2 = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 100) / 100;
const rowsDto = (rows: readonly LeaderboardRowDto[]): readonly LeaderboardRowDto[] =>
  rows.map((row) => ({
    rank: row.rank,
    entryId: row.entryId,
    item: row.item,
    score: round2(row.score),
    votes: row.votes,
    provisional: row.provisional,
    votesNeeded: row.votesNeeded,
  }));

/** `GET /api/lists/:list/leaderboard` */
export const getLeaderboard = async (request: Request, app: App): Promise<Response> => {
  const result = await app.ranking.getLeaderboard(await actorOf(request, app), {
    list: listParam(request),
  });
  if (!result.ok) return domainErrorResponse(result.error);
  const view = result.value;
  const body: LeaderboardDto = view.hidden
    ? { hidden: true, revealsAt: view.revealsAt?.toISOString() ?? null }
    : {
        hidden: false,
        computedAt: view.board.computedAt.toISOString(),
        minVotes: view.minVotes,
        rows: rowsDto(view.board.rows),
        ...(view.board.groups === undefined
          ? {}
          : {
              groups: {
                main: rowsDto(view.board.groups.main),
                setAside: rowsDto(view.board.groups.setAside),
              },
            }),
      };
  return json(body);
};
