import type { ItemSourceKind, Lifecycle, LoginOutcomeCode } from '../../server/http/contracts.ts';

export const lifecycleLabel: Record<Lifecycle, string> = {
  draft: 'Draft',
  scheduled: 'Opening soon',
  open: 'Open',
  closed: 'Closed',
  archived: 'Archived',
};

export const sourceLabel: Record<ItemSourceKind, string> = {
  'tmdb-movie': 'Movies (TMDB)',
  'tvdb-series': 'TV shows (TheTVDB)',
  'igdb-game': 'Games (IGDB)',
  freeform: 'Free text',
  preset: 'Preset list (CSV)',
};

export const sourceExplanation: Record<ItemSourceKind, string> = {
  'tmdb-movie':
    'Members search for movies and select a result, with posters and details from TMDB.',
  'tvdb-series': 'Members search for TV series, not individual episodes, using TheTVDB.',
  'igdb-game': 'Members search for video games, with covers and details from IGDB.',
  freeform:
    'Members type their own titles. There are no automatic posters or catalog details. No automatic content filter: any words or free text can be submitted, so moderation may be needed.',
  preset:
    'Upload your own collection as a CSV spreadsheet. Include every item or let members choose nominations.',
};

/** What to tell someone who comes back from Discord with `?login=<code>`. */
export const loginMessage: Record<LoginOutcomeCode, string> = {
  cancelled: 'Sign-in was cancelled. You can try again whenever you like.',
  'http.internal':
    'We could not complete your sign-in right now. Please try again shortly. If this keeps happening, contact the site administrator.',
  'identity.invalid-login-state':
    'That sign-in link expired or was opened in a different browser. Please try again.',
  'identity.not-a-member': 'Only members of this community’s Discord server can sign in.',
  'identity.login-rejected': 'Discord didn’t accept that sign-in. Please try again.',
  'identity.discord-unavailable': 'Discord isn’t responding right now. Please try again shortly.',
  'identity.member-conflict': 'Something changed at the same moment. Please sign in again.',
};

export const isLoginOutcome = (code: string): code is LoginOutcomeCode => code in loginMessage;
