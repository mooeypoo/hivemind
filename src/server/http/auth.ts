import type { Actor } from '../../shared/kernel/index.ts';
import type { App } from '../composition.ts';
import { readCookie, SESSION_COOKIE } from './cookies.ts';

export const actorOf = (request: Request, app: App): Promise<Actor> =>
  app.identity.resolveActor(readCookie(request, SESSION_COOKIE));
