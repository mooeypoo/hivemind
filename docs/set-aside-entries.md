# Set-aside entries

Admins can classify an active entry as outside a list's criteria without deleting it
or its ratings. This is entry metadata, not a second List aggregate.

## Behavior

- Setting aside requires a member-visible plain-text explanation of 1-500 characters
  after trimming. Admins can edit it or return the entry to the main ranking.
- Classification is allowed in draft, scheduled, open and closed lists, but not
  archived lists. Closed-list corrections explicitly warn that final standings change.
- Voting eligibility, nomination allowances, ballots, public-score visibility and
  minimum-vote requirements are unchanged.
- Withdrawal hides the entry as usual. Re-nomination of the same item retains its
  classification and explanation, so it cannot bypass an Admin's decision.
- Older entries and backups without this metadata mean "not set aside".
- Backups preserve the classification, but exclude Admin attribution and activity history.
  Admin-only activity records classification changes and the responsible Admin for one
  calendar year (or until data erasure), then retains unnamed events with the list.
  Previous explanations are never copied into history. Deleting an entry deletes its
  identifying history. See [the admin guide](./admin-guide.md#admin-only-activity).
  Explanations should describe the item, not contain personal information.

## Viewing rankings

When there are set-aside entries, a collapsed-by-default **Ranking view** disclosure
appears on both standings surfaces. Its summary shows the selected view; opening it
reveals **Separate rankings** / **Combine ranking** and the explanation. These are
secondary viewing options, not a prerequisite for reading results. Separate rankings
is the default; the choice is local to the mounted view and does not change the list
for other members. Collapsing the controls preserves the selected view.

- **Separate rankings:** main entries compete only against main entries. A quieter section
  at the end ranks set-aside entries against one another, starting at 1, without a
  second podium. Each group independently handles ties, provisional and unrated items.
- **Combine ranking:** all active entries compete together; set-aside badges and explanations
  remain visible.
- A short sentence explains the selected view: set-aside entries are either ranked
  in their own group below the main list or included in the main list's ranking.
- Bayesian scores are recalculated within each displayed group, including that
  group's prior average. Scores and relative ordering can change between views.
  Set-aside ratings have no influence on the separate main ranking.
- No marked entries means the existing leaderboard presentation. An empty main group
  has an explicit message. Neither mode reveals after-close results early.
- Classification changes invalidate cached standings without waiting for the TTL.
  Score changes alone retain the existing TTL policy. All variants use the same
  ballot snapshot and computation timestamp.

## Management and presentation

The entry details dialog exposes Set aside, Edit explanation and Return to main
ranking to Admins from the rating list, the Standings tab and the full results page,
including the separate set-aside group and combined rankings. The same dialogs and
safeguards apply everywhere. Archived lists remain read-only for classification.
Admins can also permanently delete an entry from any of these views, including on
archived lists, with the same typed-title confirmation. Failed deletion cleanup
refreshes the list's paused state and can be retried from either page.

Saving checks both the nomination incarnation and
the previously observed explanation to reject stale edits. Errors retain the draft.
The editor explains that ratings remain, that the reason is member-visible, and
that closed-list corrections affect final results.

Entry cards and standings show a compact **Set aside** tag and **Why?** button,
which opens the entry details dialog with the full explanation. Long reasons never
expand the ranking rows or podium cards, in either separate or combined views.
Entry details and one-by-one rating dialogs show the full explanation.
Places in the separate set-aside group are labelled accordingly.
Reasons are rendered as text, never HTML. Existing theme tokens and static CSS are
used; no new dependencies or boundary rules are needed.

## Implementation surfaces

- Lists owns validation, the guarded Admin use case, versioned entry persistence,
  views, re-nomination behavior and backup data.
- `PUT /api/lists/:list/entries/set-aside` accepts `entryId`, `token`,
  `expectedReason` and `reason` (null returns an entry to the main ranking).
- Ranking receives classification through the lists public interface and computes
  combined and independent boards with the registered strategy. It receives no
  member identities or explanations.
- HTTP maps the variants to typed DTOs. The web app selects a precomputed variant,
  without fetching ballots or duplicating ranking mathematics.
