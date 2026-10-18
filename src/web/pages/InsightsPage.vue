<script setup lang="ts">
import { computed, ref } from 'vue';
import ErrorNotice from '../components/ErrorNotice.vue';
import ProportionBar from '../components/ui/ProportionBar.vue';
import { useInsights } from '../composables/insights.ts';
import { coveragePercent, ratingsPerVoter } from '../lib/insights.ts';
import { lifecycleLabel } from '../lib/labels.ts';
import { usePageTitle } from '../lib/page-title.ts';

const { selectedList, data, error, busy, refresh } = useInsights();
const selected = computed(() =>
  selectedList.value === '' ? null : (data.value?.lists[0] ?? null),
);
const title = computed(() => selected.value?.title ?? 'Community insights');
usePageTitle(() => title.value);
const sort = ref<'voters' | 'coverage' | 'ratings'>('voters');
const available = computed(() =>
  (data.value?.lists ?? [])
    .filter((list) => list.status === 'available')
    .sort((a, b) => {
      const metric = sort.value;
      return (
        (metric === 'coverage'
          ? (coveragePercent(b.metrics.ratedEntries, b.metrics.entries) ?? -1) -
            (coveragePercent(a.metrics.ratedEntries, a.metrics.entries) ?? -1)
          : b.metrics[metric] - a.metrics[metric]) || a.title.localeCompare(b.title)
      );
    }),
);
const excluded = computed(() =>
  (data.value?.lists ?? []).filter((list) => list.status !== 'available'),
);
const coverage = computed(() =>
  data.value === null
    ? null
    : coveragePercent(data.value.totals.ratedEntries, data.value.totals.entries),
);
const peak = computed(() =>
  selected.value?.status === 'available'
    ? Math.max(1, ...selected.value.distribution.map((bin) => bin.entries))
    : 1,
);
const updatedAt = computed(() =>
  data.value === null ? '' : new Date(data.value.computedAt).toLocaleString(),
);
const number = (value: number) => value.toLocaleString();
const revealDate = (value: string) => new Date(value).toLocaleString();
</script>

<template>
  <div class="insights-page stack">
    <header class="insights-heading">
      <div class="stack">
        <RouterLink v-if="selectedList !== ''" :to="{ name: 'insights' }"
          >All community insights</RouterLink
        >
        <p class="eyebrow">Admin only · Participation, not surveillance</p>
        <h1>{{ title }}</h1>
        <p class="lead">A clearer picture of what we create together.</p>
      </div>
      <button type="button" class="button" :disabled="busy" @click="refresh">
        Refresh insights
      </button>
    </header>
    <ErrorNotice :error="error" />
    <p v-if="busy" role="status">Loading insights…</p>
    <template v-if="data !== null">
      <p class="meta insights-scope">
        Current state · Updated <time :datetime="data.computedAt">{{ updatedAt }}</time>
        <template v-if="selectedList === ''">
          · {{ data.includedLists }}
          {{ data.includedLists === 1 ? 'list included' : 'lists included' }}
          <template v-if="data.excludedLists > 0">
            · {{ data.excludedLists }}
            {{ data.excludedLists === 1 ? 'list excluded' : 'lists excluded' }}</template
          >
        </template>
      </p>
      <p v-if="data.lists.length === 0" class="empty">
        No lists yet. Insights will appear as your community creates and rates entries.
      </p>
      <template v-if="data.includedLists > 0">
        <section class="insights-hero" aria-labelledby="participation-heading">
          <div class="insights-hero__main">
            <h2 id="participation-heading" class="eyebrow">The people behind the participation</h2>
            <p class="insights-hero__number">{{ number(data.totals.voters) }}</p>
            <p class="insights-hero__label">
              {{ data.totals.voters === 1 ? 'member has' : 'members have' }} rated entries
            </p>
            <p class="meta">
              Each person counted once{{ selectedList === '' ? ' across included lists' : '' }}.
            </p>
          </div>
          <dl class="insights-facts">
            <div>
              <dt>Current ratings</dt>
              <dd>{{ number(data.totals.ratings) }}</dd>
            </div>
            <div>
              <dt>Current entries</dt>
              <dd>{{ number(data.totals.entries) }}</dd>
            </div>
            <div>
              <dt>Nominators</dt>
              <dd>{{ number(data.totals.nominators) }}</dd>
            </div>
            <div>
              <dt>Ratings per voter</dt>
              <dd>{{ ratingsPerVoter(data.totals.ratings, data.totals.voters) }}</dd>
            </div>
          </dl>
        </section>
        <section class="insights-coverage" aria-labelledby="coverage-heading">
          <div>
            <p class="eyebrow">Breadth of participation</p>
            <h2 id="coverage-heading">Every entry deserves a look.</h2>
            <p>
              {{ number(data.totals.ratedEntries) }} of {{ number(data.totals.entries) }} entries
              have at least one rating.
            </p>
          </div>
          <div class="insights-coverage__chart">
            <strong>{{ coverage === null ? '—' : `${coverage}%` }}</strong>
            <span class="meta">Entry coverage</span>
            <ProportionBar :value="data.totals.ratedEntries" :max="data.totals.entries" />
          </div>
          <dl class="insights-coverage__facts">
            <div>
              <dt>Unrated entries</dt>
              <dd>{{ number(data.totals.entries - data.totals.ratedEntries) }}</dd>
            </div>
            <div>
              <dt>Meet their ranking threshold</dt>
              <dd>{{ number(data.totals.readyEntries) }}</dd>
            </div>
            <div>
              <dt>Need more ratings to qualify</dt>
              <dd>{{ number(data.totals.entries - data.totals.readyEntries) }}</dd>
            </div>
          </dl>
        </section>
      </template>
      <section
        v-if="selectedList === '' && available.length > 0"
        class="stack"
        aria-labelledby="lists-heading"
      >
        <header class="insights-heading">
          <div>
            <p class="eyebrow">List by list</p>
            <h2 id="lists-heading">Where the community gathers</h2>
          </div>
          <div>
            <label for="insights-sort">Order by</label
            ><select id="insights-sort" v-model="sort">
              <option value="voters">Voters</option>
              <option value="ratings">Ratings</option>
              <option value="coverage">Entry coverage</option>
            </select>
          </div>
        </header>
        <ol class="insights-lists">
          <li v-for="list in available" :key="list.id" class="insights-list">
            <div class="stack">
              <p class="meta">
                {{ lifecycleLabel[list.lifecycle]
                }}<template v-if="list.visibility === 'hidden'"> · Hidden</template>
              </p>
              <h3>
                <RouterLink :to="{ name: 'insights', query: { list: list.slug } }">{{
                  list.title
                }}</RouterLink>
              </h3>
              <p class="meta">
                {{ number(list.metrics.entries) }} entries ·
                {{ number(list.metrics.ratings) }} ratings
              </p>
            </div>
            <p class="insights-list__people">
              <strong>{{ number(list.metrics.voters) }}</strong
              ><span>voters</span>
            </p>
            <div class="insights-list__coverage">
              <span>{{
                coveragePercent(list.metrics.ratedEntries, list.metrics.entries) === null
                  ? 'No entries yet'
                  : `${coveragePercent(list.metrics.ratedEntries, list.metrics.entries)}% of entries rated`
              }}</span>
              <ProportionBar :value="list.metrics.ratedEntries" :max="list.metrics.entries" />
              <span class="meta"
                >{{ list.metrics.entries - list.metrics.readyEntries }} not ready for a rank</span
              >
            </div>
          </li>
        </ol>
      </section>
      <section
        v-if="selected?.status === 'available'"
        class="stack card"
        aria-labelledby="distribution-heading"
      >
        <p class="eyebrow">Attention across entries</p>
        <h2 id="distribution-heading">Ratings per entry</h2>
        <p>How broadly ratings are spread, without showing any score values.</p>
        <p v-if="selected.distribution.length === 0" class="empty">
          No current entries to compare.
        </p>
        <ul v-else class="insights-distribution" aria-label="Rating count distribution">
          <li v-for="bin in selected.distribution" :key="bin.ratings">
            <span>{{ bin.ratings }} {{ bin.ratings === 1 ? 'rating' : 'ratings' }}</span>
            <ProportionBar :value="bin.entries" :max="peak" />
            <strong>{{ bin.entries }} {{ bin.entries === 1 ? 'entry' : 'entries' }}</strong>
          </li>
        </ul>
        <table>
          <caption>
            Ratings per entry: exact counts
          </caption>
          <thead>
            <tr>
              <th scope="col">Ratings received</th>
              <th scope="col">Entries</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="bin in selected.distribution" :key="bin.ratings">
              <th scope="row">{{ bin.ratings }}</th>
              <td>{{ bin.entries }}</td>
            </tr>
          </tbody>
        </table>
        <p class="meta">
          {{ selected.minVotes }} ratings needed to meet this list's ranking threshold; an entry
          always needs a rating to rank. Includes {{ selected.metrics.setAsideEntries }} set-aside
          entries. {{ selected.metrics.withdrawnEntries }} withdrawn entries excluded.
        </p>
        <RouterLink :to="{ name: 'list', params: { slug: selected.slug } }">Open list</RouterLink>
      </section>
      <section v-if="excluded.length > 0" class="stack" aria-labelledby="excluded-heading">
        <h2 id="excluded-heading">Not included in these numbers</h2>
        <article v-for="list in excluded" :key="list.id" class="card stack">
          <h3>{{ list.title }}</h3>
          <template v-if="list.status === 'after-close'">
            <p>
              <strong>Results after close.</strong> Participation statistics are withheld too,
              including from admins and site totals.
            </p>
            <p v-if="list.revealsAt === null" class="meta">
              Voting is open-ended or not scheduled. Statistics appear after voting ends.
            </p>
            <p v-else class="meta">
              Reveals after voting ends, currently scheduled for {{ revealDate(list.revealsAt) }}.
            </p>
          </template>
          <p v-else>Cleanup in progress. Statistics stay unavailable until deletion finishes.</p>
        </article>
      </section>
      <details class="insights-method card stack">
        <summary>How these numbers work</summary>
        <div class="insights-method__body">
          <h2 class="insights-method__intro">
            A picture of <strong>current participation</strong>, not lifetime activity.
          </h2>
          <div class="insights-method__grid">
            <section class="insights-method__section" aria-labelledby="method-counts">
              <h3 id="method-counts">What we count</h3>
              <dl class="insights-method__definitions">
                <div>
                  <dt>Voters</dt>
                  <dd>
                    Members with at least one rating on a current entry. Empty ballots and ratings
                    on withdrawn entries do not count. Set-aside entries still count because members
                    can rate them.
                  </dd>
                </div>
                <div>
                  <dt>Nominators</dt>
                  <dd>
                    Distinct members still attributed to current nominations. Seeded entries do not
                    create nominators.
                  </dd>
                </div>
                <div>
                  <dt>Entry coverage</dt>
                  <dd>
                    The share of current entries with a rating, not the percentage of the Discord
                    community participating.
                  </dd>
                </div>
              </dl>
              <p class="insights-method__note">
                Voters and nominators can overlap. <strong>Do not add them</strong> as a contributor
                total.
              </p>
            </section>
            <section class="insights-method__section" aria-labelledby="method-scope">
              <h3 id="method-scope">Which lists are included</h3>
              <ul class="insights-method__list">
                <li>
                  <strong>Counted once:</strong> site-wide people counts deduplicate across included
                  lists.
                </li>
                <li><strong>Admin scope:</strong> hidden and draft lists may be included.</li>
                <li><strong>After-close lists:</strong> excluded until voting ends.</li>
                <li><strong>Permanent deletion:</strong> lists undergoing cleanup are excluded.</li>
              </ul>
            </section>
            <section class="insights-method__section" aria-labelledby="method-changes">
              <h3 id="method-changes">Why numbers can change</h3>
              <ul class="insights-method__list">
                <li>
                  <strong>Removed contributions:</strong> erasure, withdrawal and permanent deletion
                  can reduce counts, even on finished lists.
                </li>
                <li>
                  <strong>Restored lists:</strong> numbers describe restored content, not new
                  activity.
                </li>
                <li>
                  <strong>During a refresh:</strong> reads span several records, so participation in
                  progress can briefly make counts differ.
                </li>
              </ul>
            </section>
            <section
              class="insights-method__section insights-method__section--privacy"
              aria-labelledby="method-privacy"
            >
              <p class="eyebrow">Only what is already needed</p>
              <h3 id="method-privacy">Privacy, by design</h3>
              <p>
                No names, individual scores, tracking identifiers or participation history are
                collected for insights.
              </p>
              <p>
                <strong>Nothing new is retained.</strong> Each refresh reads the data already needed
                to run lists.
              </p>
            </section>
          </div>
        </div>
      </details>
    </template>
  </div>
</template>
