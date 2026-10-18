# Admin guide and FAQ

This guide is for community moderators who create and manage lists. You do not need
to understand the site's code or hosting. Sign in with Discord and choose **Admin**
in the top navigation; its links open directly beneath the button. On mobile, open
your account menu and look for **Admin** there.

## Community insights

Choose **Community insights** from the Admin menu for a site-wide overview. Select a list
there, or use **Admin · Insights** on a list, to see its participation and ratings-per-entry
distribution. Insights are admin-only; they never show individual scores or member identities.
They are not visitor analytics and add no tracking.

- **Voters** have at least one rating on a current, non-withdrawn entry. Empty ballots do
  not count. Each person counts once across the included lists.
- **Ratings** are currently stored scores, not the number of times people pressed a button.
- **Nominators** are distinct members still attributed to current entries. Seeded entries
  do not create nominators. Voters and nominators overlap; do not add them as a people total.
- **Entry coverage** is the share of current entries with at least one rating, not the
  share of your Discord server participating.
- **Ranking threshold** measures how many entries have enough ratings to qualify for a
  rank. Entries with no ratings never qualify, even when the configured minimum is zero.

Set-aside entries remain rateable and count in participation. Withdrawn entries and their
retained scores do not. Re-nominating a withdrawn item restores its retained ratings.
Erasure, cleared ratings and permanent deletion can reduce counts, including for finished
lists. Imported lists contribute their restored content, not a reconstructed history.

Hidden and draft lists can appear for admins. After-close lists contribute no participation
statistics until voting ends, including in site totals. Lists undergoing permanent entry or
list deletion are excluded during cleanup. Excluded lists show an explanation, not zeroes.
Totals and site-wide unique counts cover included lists only.

Use **Refresh insights** to read current data. There is no automatic polling, historical
snapshot, new analytics store or participation event log. Reads span multiple records, so
changes during a refresh can briefly make numbers differ. Small counts can still let an
admin infer participation from other knowledge: aggregate counts do not guarantee anonymity.

## Create your first list

1. Choose **New list** from the Admin menu.
2. Give it a title, address and description. Explain what belongs in the list.
3. Choose an item type deliberately. A movie list and a write-in list work differently.
4. Check rating, nomination, participation and privacy settings.
5. Choose **Create draft**. Only admins can see a draft.
6. In **Choose timing**, choose dates, or leave participation starting immediately with no automatic end.
7. Choose **Continue to review**. Read the member experience and settings that will lock.
8. Confirm the review, then publish. A scheduled opening still publishes the list now.

Drafts are safe to edit. Publishing fixes most settings immediately, not when the first
person votes. **Save draft** saves planned dates to the site too, so another admin can
review and continue the plan. It does not publish the list or start participation.
Unsaved edits remain only in your browser tab.

### Recovered edits and changed settings

Your browser keeps changes you make without saving and restores them after a reload
or sign-in. The settings saved on the site may have changed in the meantime.
**Review settings before saving** shows any differences so you can choose which to
keep. Matching input needs no warning.
The **Review needed** panel is separate from the form. Each changed setting has its
own bordered comparison: **Currently on the site**, marked in green, and **Your unsaved
edits**, with an explanation beneath each heading. They appear side by side on larger
screens and one above the other on phones. Published, visible lists label the saved
version as what members see now; drafts and hidden lists are labeled separately.
Your choice applies to all the recovered edits, not just one setting.

If settings change while the editor is open, a save is refused rather than overwriting
them. **Compare latest settings** loads the saved version and shows its differences
from your form. If they already match, the warning clears and you can continue editing.

Choose **Discard my edits and load saved settings** to replace your form with the
settings saved on the site, or **Keep my unsaved edits** to keep your form and review
it before saving again. Keeping edits does not save them.
If the list's status has changed, load the saved settings so the editor can apply
the current editing restrictions.

This protection applies to both drafts and published lists: published descriptions
and deadlines can still be edited. It compares settings, not entries or scores;
ordinary nominations and voting do not trigger it.

After creating a draft, the editor moves to **Choose timing** and summarizes your setup.
Choose **Edit setup** or **1. Set up** to go back and change earlier choices, then
**Continue to timing** to return. Your unsaved settings and dates stay in the form
when you move between steps. From the publication review, **Back to timing** lets
you check dates or return to setup again. Moving between steps never saves or publishes.
Use **Save draft** when you want to save your work and finish later.

The publication review groups your choices into **What members will experience** and
**Timing & access**, followed by the settings that become fixed. Check any moderation
or score-privacy notices and the acknowledgments before publishing. On larger screens,
the summaries sit side by side; the back and publish buttons stay visible while you read.

New lists allow **unlimited nominations per member** by default. Uncheck **Unlimited**
and choose a limit if your community needs one. Existing lists keep their saved limits.

## Choose the right item type

| Type               | What members do                                                          |
| ------------------ | ------------------------------------------------------------------------ |
| Movies (TMDB)      | Search for movies and select catalog results with posters and details.   |
| TV shows (TheTVDB) | Search for series, not individual episodes.                              |
| Games (IGDB)       | Search for video games with covers and details.                          |
| Free text          | Type their own titles. No automatic images or catalog details.           |
| Preset list (CSV)  | Choose from your uploaded collection, or rate every item from the start. |

Only integrations enabled by the site operator appear. If one is missing, ask the
operator; changing a list title does not enable an integration.

**Free text has no automatic content filter. Members can submit any words or free
text, including inappropriate or off-topic content, so moderation may be needed.**
There are no automatic posters or catalog details. Explain what belongs in your list,
and use **Admin tools** on an entry to set it aside or delete it when necessary.

For a collection, upload a CSV spreadsheet with `title` or `title,subtitle` as its
first row and up to 200 items. For example:

```csv
title,subtitle
OK Computer,Radiohead
Discovery,Daft Punk
```

**Rate them all** includes every item when you publish; members do not nominate.
**Nominate from them** lets members choose which collection items enter the list.
Check the imported item count and fix any reported row errors before continuing.

Item type can change only while the list has never had an entry and is not finished.
Withdrawn entries still count. Including a whole collection locks its source when
published. The editor also temporarily locks source changes during an unfinished item write.

## Who sees what?

When editing a published list, settings you cannot change are collapsed under
**Fixed · view settings**. Open them to inspect the saved choices; opening a panel
does not unlock its controls. Editable descriptions, voting deadlines and removable
nomination limits stay visible. An unused list's item source stays visible when it
can still be changed. One-way actions such as making named scores private remain
in **Admin controls**. Closed and archived lists keep their settings read-only.

These are independent settings:

- **List visibility:** community members must sign in to view lists. Hidden lists are
  admin-only. Drafts are always admin-only. A non-hidden published list is visible
  before its participation opening time. Shared-link previews can show its title,
  but never entries, member details or scores.
- **Participation roles:** no roles selected means everyone may nominate and rate.
  Otherwise members need any one selected role. This does not stop other members
  viewing the list. Admin status does not bypass participation-role requirements.
- **Standings timing:** live standings are visible during voting. After-close
  standings stay hidden from everyone, including admins, until voting ends.
- **Individual scores:** private by default. Members see their own scores; scores
  still contribute to standings. Admins cannot inspect other members' private scores.
  Named scores show who gave what, to signed-in members, only when standings are visible.
- **Nomination names:** shown by default. Hiding names does not hide individual scores.

Named scores must be chosen before publishing. Afterwards you may make them private,
but never change private scores to named. Hiding scores cannot undo what people
already saw or copied.

## Dates and deadlines

Times use the timezone shown in your editor. Another admin in another timezone may see
different local clock times for the same moment.

1. **Participation opens:** eligible members may nominate and rate.
2. **Nominations close (optional):** no more entries can be nominated, but rating continues.
   Leave blank to keep nominations open until voting ends.
3. **Voting closes (optional):** no more scores can change, and after-close standings appear.
   Without a date, an admin must use **Close voting now**.

The nomination deadline must be after opening and no later than voting closes.
Voting must close after opening, and a chosen end must be in the future.
Saved draft dates may become outdated while you plan; you can still save draft edits,
but publishing checks the dates again. Correct any expired end date before publishing.
If opening is **Right away when published**, it means the moment you actually publish,
not the time you saved the draft.
Choosing after-close standings with no end date means results wait until an admin closes voting.

Hiding a list does **not** pause its clock.

## What can I edit later?

| Setting                                       | After publishing                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Title and address                             | Fixed.                                                                                                  |
| Description                                   | Editable while scheduled or open, not after voting closes or archiving.                                 |
| Item type / imported collection               | Only while unused, as described above; never on finished lists.                                         |
| Nomination mode                               | Fixed.                                                                                                  |
| Score range, confirmed-rank threshold         | Fixed.                                                                                                  |
| Standings timing                              | Fixed.                                                                                                  |
| Show nominator names                          | Fixed.                                                                                                  |
| Participation roles                           | Fixed.                                                                                                  |
| Participation opening and nomination deadline | Fixed, including before a scheduled opening.                                                            |
| Nomination limit                              | While scheduled or open, remove a finite limit entirely; no other changes.                              |
| Voting end                                    | While scheduled or open, extend/remove a deadline or give open-ended voting a future end. No reopening. |
| Individual-score visibility                   | Named to private only.                                                                                  |
| List visibility                               | Change any time, including after closing or archiving.                                                  |

The editor labels these policies beside the settings. Once voting closes, ordinary
configuration edits stop. To correct an unsuitable entry, use moderation rather than
trying to rewrite the list's original rules.

## Manage entries: set aside, withdraw or delete?

Open an entry's full details. **Admin tools** affect everyone; your own rating and
nomination actions are separate.

- **Set aside:** classify an entry as outside the list's criteria. Give a short
  explanation shown to members; describe the item, not someone's personal information.
  Ratings stay and members can still rate it. Standings normally give set-aside
  entries their own ranking. Members can choose a combined view.
- **Return to main ranking:** reverses the classification. Admins can also edit its
  explanation. Classification can change after voting closes, but not after archiving.
- **Withdraw nomination:** a personal action for the original nominator while nominations
  are open. The entry disappears and their allowance is freed. Earlier scores remain
  stored and return if someone re-nominates the same item. Set-aside classification remains.
- **Delete entry:** permanently removes the entry, scores and nomination records. Type
  the title to confirm. If nominated again it starts without previous scores.
  This can change closed or archived results.

Deletion temporarily pauses nominations and scoring while cleanup runs. If interrupted,
use **Retry entry deletion**; starting deletion cannot be cancelled. Old backup files
are not erased by deletion.

## Close, archive, hide or delete a list?

| Action           | Effect                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Close voting now | Ends participation immediately and reveals after-close standings. Cannot reopen voting.                                      |
| Archive          | Ends participation, files the list under Archived, and prevents ordinary edits and classification changes. Cannot unarchive. |
| Hide             | Makes the list admin-only without erasing entries or scores. Reversible; does not pause deadlines.                           |
| Delete list      | Permanently removes the list, entries, nomination records and scores. Type its address to confirm.                           |

Closing and archiving keep the list visible unless you hide it. "Final" means voting
has ended: permitted admin corrections or permanent deletions can still change standings.
Archived TMDB movie details are removed after 183 days under the source's retention
policy; scores and ranks remain. Consider that before archiving.

List deletion cannot be cancelled once started. If interrupted, open the editor and
retry deletion. After cleanup its address can be reused, so old links may lead to a
replacement list.

## Working with other admins

Drafts, including their saved dates, are shared, but unsaved input is local to your browser tab.
The editor checks whether the saved settings changed since you opened the list.
If another admin saves first, your save, publication or status action is stopped rather
than overwriting their work. Votes and background updates do not trigger this warning.
Your unsaved input stays in the form, including after reloading in the same tab.

Choose **Compare latest settings** to see the differences. You can replace your input
with the latest saved settings, or explicitly keep your input after comparing. Keeping
input does **not** save or publish: review it and save again. If the list has since been
published, closed or archived, load the latest settings to see what is still editable.
The site does not automatically merge changes. Coordinate with your fellow admins
before replacing their choices.

### Admin-only activity

Open **Activity log** in the Admin menu to see decisions across every list, newest first.
Use the **List** filter to focus on one list, including drafts, hidden and archived lists.
The filter is kept in the page address, so you can bookmark or share that view with another
admin. **Older activity** and **Newer activity** move through pages of 20 events;
**Refresh activity** returns to the newest page with the same filter.

Each event shows the action, the current list name (linking to its editor), the admin
and the local date and time. **View changes** reveals the changed settings. Names shown
for lists are their current names, not historical titles.

You can also open **List activity → Show activity** in the list editor to see who created, imported,
published or changed a list, changed its visibility, closed voting, archived it, or
moderated an entry. Entries also show the last moderation attribution in **Admin tools**.
**Open full activity log** opens the general log already filtered to that list.
Ordinary members cannot see these identities or the activity history. Older lists have
no retrospective history for actions taken before this feature was introduced.

Names are kept for **one calendar year after each action**, then removed automatically.
The action and time remain for as long as the list exists. **Delete my data** removes an
admin's attribution immediately; their still-attributed activity is included in **Download
my data**. Losing admin access does not erase earlier attribution.

History records changed fields and old/new structured settings, such as nomination
limits and dates. It does not keep old titles, addresses, descriptions or moderation
explanations, or record scores. This is a collaboration aid, not a tamper-proof audit log.
It does not include sign-ins, failed requests, or technical server errors. If deletion is
in progress, finish or retry it from the list before refreshing activity.

Deleting an entry removes its identifying history; only a generic entry-deletion event
remains. Deleting a list removes its history. **Activity history is not included in list
backups**: an imported copy starts with a new import event attributed to the importing
admin, not the original list's history.

The **Roles** page gives names to Discord roles for participation choices. It does
not grant site-admin access or assign roles in Discord. Ask the site operator about
admin access; Discord role changes apply on the next sign-in.

## Backups

If enabled by the operator, download one list from its editor or all lists from
**Backups**. Keep files secure: they contain nomination names and Discord IDs.
Scores are sealed; the file alone does not reveal them.

Import adds separate lists; it never overwrites existing ones. A taken address gets
a suffix and is hidden for admin review. Otherwise, imported lists retain the backed-up
visibility; review it before sharing. A different backup key restores
list content but not personal nomination data or votes. Review the import summary.

Backups do not reopen or unarchive the original list. Previously downloaded files are
not erased by later list/entry deletion. Restoring them can restore a separate copy.
Member data erasure protections still apply; see the site's Privacy page.

## FAQ

### Why can't I change a setting before the opening date?

Publishing locks most choices immediately. A scheduled list has already been published.
Use the review step to check these choices before publishing.

### Can I change a movie list into a TV list?

Only while unused and still scheduled or open, or in an unused draft. An entry,
even if withdrawn later, prevents this. Otherwise create a new list.

### Can I reopen voting or shorten its deadline?

No reopening. An active deadline can be extended or removed. Use **Close voting now**
to end immediately; you cannot schedule an earlier end by editing.

### Why isn't an entry ranked?

It may need more ratings to reach the confirmed-rank threshold (2 by default).
It can still be rated. Unrated entries have no rank. Set-aside entries usually
appear in a separate group. Standings are cached, so score changes can take about
two minutes to appear.

### Does private voting mean admins can see everyone's scores?

No. Individual scores remain private even from admins. The leaderboard uses
aggregates. Named scores are available only if chosen before publication and only
when results are visible.

### Why can someone see the list but not rate it?

Check participation roles, opening and closing times, and whether deletion cleanup
has paused participation. Admins must meet participation-role requirements too.

### Why did an old score return after a nomination was withdrawn?

Withdrawal hides the entry, not its retained ballots. Re-nominating the same item
brings its earlier scores back. Permanent deletion is different.

### Who should handle setup errors or unavailable integrations?

Ask the site operator. Do not put access tokens, cookies or personal data into
list descriptions or set-aside explanations.
