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
  freeform: 'Free text',
  preset: 'Preset list (CSV)',
};

/** What to tell someone who comes back from Discord with `?login=<code>`. */
export const loginMessage: Record<LoginOutcomeCode, string> = {
  cancelled: 'Sign-in was cancelled. You can try again whenever you like.',
  'identity.invalid-login-state':
    'That sign-in link expired or was opened in a different browser. Please try again.',
  'identity.not-a-member': 'Only members of this community’s Discord server can sign in.',
  'identity.login-rejected': 'Discord didn’t accept that sign-in. Please try again.',
  'identity.discord-unavailable': 'Discord isn’t responding right now. Please try again shortly.',
  'identity.member-conflict': 'Something changed at the same moment. Please sign in again.',
};

export const isLoginOutcome = (code: string): code is LoginOutcomeCode => code in loginMessage;
