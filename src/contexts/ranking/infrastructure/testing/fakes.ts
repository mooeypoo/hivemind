import { domainError, err, ok } from '../../../../shared/kernel/index.ts';
import type {
  LeaderboardCache,
  ListSource,
  RankingContext,
  ScoreSource,
} from '../../application/ports.ts';
import type { ItemSnapshot, Leaderboard } from '../../domain/leaderboard.ts';

const item = (title: string): ItemSnapshot => ({
  source: 'freeform',
  externalId: title.toLowerCase(),
  title,
  subtitle: null,
  imageUrl: null,
});

/** One list, `l1`, whose entries, ballots and settings tests change directly. */
export class FakeRankingSources implements ListSource, ScoreSource {
  settings: Omit<RankingContext, 'entryIds'> = {
    listId: 'l1',
    resultsVisibility: 'live',
    closesAt: new Date('2026-03-20T00:00:00Z'),
    strategy: 'bayesian',
    minVotes: 0,
  };
  entryList: { id: string; item: ItemSnapshot }[] = [
    { id: 'a', item: item('Alpha') },
    { id: 'b', item: item('Beta') },
  ];
  ballots: Record<string, number>[] = [];
  /** How many times the full data was read (i.e. the board was rebuilt). */
  builds = 0;

  addEntry(id: string, title: string): void {
    this.entryList.push({ id, item: item(title) });
  }

  context(list: string) {
    return Promise.resolve(
      list === 'l1'
        ? ok({ ...this.settings, entryIds: this.entryList.map((entry) => entry.id) })
        : err(domainError('not-found', 'lists.not-found', 'Not found')),
    );
  }

  entries() {
    this.builds += 1;
    return Promise.resolve([...this.entryList]);
  }

  scoresForList() {
    return Promise.resolve(this.ballots.map((ballot) => ({ ...ballot })));
  }
}

export class InMemoryLeaderboardCache implements LeaderboardCache {
  private readonly boards = new Map<string, Leaderboard>();
  get(listId: string) {
    return Promise.resolve(this.boards.get(listId) ?? null);
  }
  put(board: Leaderboard) {
    this.boards.set(board.listId, board);
    return Promise.resolve();
  }
}
