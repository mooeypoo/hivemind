/**
 * Lists who can view, nominate and rate every list, and which lists need an Admin to review
 * their access. Read-only. Exits with status 1 when any list needs review.
 *
 *   npm run access:audit         local `netlify dev` data (.netlify/blobs-serve)
 *   NETLIFY_SITE_ID=… NETLIFY_AUTH_TOKEN=… npm run access:audit
 *                                the deployed site's production data
 *
 * A list needs review when an older version of the site changed its access. Such lists are
 * already hidden from members (only site admins can view them) until an Admin saves its access.
 */
import { auditAccess } from '../src/server/access-audit.ts';
import { withOperatorApp } from './operator-app.ts';

const review = await withOperatorApp(async (app, where) => {
  const rows = await auditAccess(app);
  console.log(`Access for ${String(rows.length)} list(s) in ${where}:\n`);
  for (const row of rows) {
    console.log(`${row.needsReview ? '!' : ' '} ${row.title} (/${row.slug}, ${row.lifecycle})`);
    console.log(`    view:     ${row.view}`);
    console.log(`    nominate: ${row.nominate}`);
    console.log(`    rate:     ${row.rate}`);
    if (row.needsReview) {
      console.log(
        `    NEEDS REVIEW: hidden from members since an older version changed its access.` +
          (row.previousView === null ? '' : ` Viewers before: ${row.previousView}.`),
      );
      console.log(`    Open /admin/lists/${row.slug}#editor-access to restore or choose access.`);
    }
  }
  return rows.filter((row) => row.needsReview).length;
});
if (review > 0) {
  console.log(`\n${String(review)} list(s) need review.`);
  process.exit(1);
}
