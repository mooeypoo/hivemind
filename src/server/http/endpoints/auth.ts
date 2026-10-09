import type { App } from '../../composition.ts';
import {
  clearCookie,
  LOGIN_RETURN_COOKIE,
  LOGIN_STATE_COOKIE,
  LOGIN_STATE_MAX_AGE_SECONDS,
  readCookie,
  SESSION_COOKIE,
  setCookie,
} from '../cookies.ts';
import type { LoginOutcomeCode } from '../contracts.ts';
import { rejectForeignOrigin } from '../origin.ts';
import { noContent, redirect, withCookies } from '../respond.ts';
import { safeReturnPath } from '../return-to.ts';
import { loginCallbackQuery } from '../schemas.ts';

/** `GET /api/auth/login?returnTo=<same-site path>` */
export const authLogin = (request: Request, app: App): Promise<Response> => {
  const { state, redirectTo } = app.identity.startLogin();
  const returnTo = safeReturnPath(new URL(request.url).searchParams.get('returnTo'));
  return Promise.resolve(
    redirect(
      redirectTo,
      withCookies(
        setCookie(LOGIN_STATE_COOKIE, state, LOGIN_STATE_MAX_AGE_SECONDS),
        setCookie(LOGIN_RETURN_COOKIE, encodeURIComponent(returnTo), LOGIN_STATE_MAX_AGE_SECONDS),
      ),
    ),
  );
};

const backToSite = (outcome: LoginOutcomeCode, ...cookies: string[]): Response =>
  redirect(
    `/?login=${encodeURIComponent(outcome)}`,
    withCookies(clearCookie(LOGIN_STATE_COOKIE), clearCookie(LOGIN_RETURN_COOKIE), ...cookies),
  );

/** `GET /api/auth/callback` */
export const authCallback = async (request: Request, app: App): Promise<Response> => {
  const query = loginCallbackQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return backToSite('cancelled');

  const result = await app.identity.completeLogin({
    ...query.data,
    expectedState: readCookie(request, LOGIN_STATE_COOKIE),
  });
  if (!result.ok) return backToSite(result.error.code as LoginOutcomeCode);

  const returnTo = readCookie(request, LOGIN_RETURN_COOKIE);
  return redirect(
    safeReturnPath(returnTo === null ? null : decodeURIComponent(returnTo)),
    withCookies(
      clearCookie(LOGIN_STATE_COOKIE),
      clearCookie(LOGIN_RETURN_COOKIE),
      setCookie(SESSION_COOKIE, result.value.token, result.value.maxAgeSeconds),
    ),
  );
};

/** `POST /api/auth/logout` */
export const authLogout = (request: Request, app: App): Promise<Response> =>
  Promise.resolve(
    rejectForeignOrigin(request, app.config.siteUrl) ??
      noContent(withCookies(clearCookie(SESSION_COOKIE))),
  );
