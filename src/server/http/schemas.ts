import { z } from 'zod';

/** Discord's redirect back to us. A cancelled sign-in arrives with `error` and no `code`. */
export const loginCallbackQuery = z.object({
  code: z.string().min(1).max(512),
  state: z.string().min(1).max(128),
});
