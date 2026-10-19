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
                }}<template v-if="list.viewers === 'site-admins'"> · Hidden</template
                ><template v-else-if="list.viewers === 'roles'"> · Some roles</template>
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
          <p class="insights-method__intro">
            <strong>Current participation, not lifetime activity.</strong>
            Calculated from the records that exist when you refresh.
          </p>
          <h2 class="visually-hidden">Understanding participation statistics</h2>
          <div class="insights-method__content">
            <section class="insights-method__section" aria-labelledby="method-counts">
              <h3 id="method-counts">What the metrics mean</h3>
              <dl class="insights-method__definitions">
                <div>
                  <dt>Voters</dt>
                  <dd>Members with at least one rating on a current entry.</dd>
                </div>
                <div>
                  <dt>Nominators</dt>
                  <dd>
                    Members still credited with a current nomination. Seeded entries do not create
                    nominators.
                  </dd>
                </div>
                <div>
                  <dt>Entry coverage</dt>
                  <dd>
                    Current entries with a rating, not the percentage of your Discord community
                    participating.
                  </dd>
                </div>
              </dl>
              <p class="insights-method__note">
                <strong>People can appear in both groups.</strong> Adding voters and nominators does
                not give a unique contributor total.
              </p>
            </section>
            <section class="insights-method__section" aria-labelledby="method-scope">
              <h3 id="method-scope">Included and excluded</h3>
              <ul class="insights-method__list">
                <li><strong>Included:</strong> current entries, including set-aside entries.</li>
                <li>
                  <strong>Not counted:</strong> empty ballots and ratings on withdrawn entries.
                </li>
                <li>
                  <strong>Withheld:</strong> after-close lists until voting ends, and lists
                  undergoing permanent entry or list deletion cleanup.
                </li>
                <li><strong>Admin scope:</strong> hidden and draft lists may be included.</li>
                <li>
                  <strong>Counted once:</strong> site-wide people totals deduplicate across included
                  lists.
                </li>
              </ul>
            </section>
            <section class="insights-method__section" aria-labelledby="method-changes">
              <h3 id="method-changes">Why numbers can change</h3>
              <ul class="insights-method__list">
                <li>
                  <strong>Contributions removed:</strong> erasure, withdrawal, cleared ratings and
                  permanent deletion can reduce counts, even on finished lists.
                </li>
                <li>
                  <strong>Backups restored:</strong> restored content is counted, not treated as new
                  activity.
                </li>
                <li>
                  <strong>Refresh in progress:</strong> changes between record reads can briefly
                  produce differences.
                </li>
              </ul>
            </section>
            <section
              class="insights-method__section insights-method__section--privacy"
              aria-labelledby="method-privacy"
            >
              <h3 id="method-privacy">Privacy and retention</h3>
              <p>
                No additional personal data, tracking identifiers or participation history are
                collected or retained for insights. Responses contain no names or individual scores.
              </p>
              <p>Small aggregate counts can still allow inference from other knowledge.</p>
            </section>
          </div>
        </div>
      </details>
    </template>
  </div>
</template>
