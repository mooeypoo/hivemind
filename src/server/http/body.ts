import type { z } from 'zod';
import { errorBody, json } from './respond.ts';

const MAX_BODY_BYTES = 256 * 1024;

export type Parsed<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly response: Response };

const issues = (error: z.ZodError): string[] =>
  error.issues.map((issue) =>
    issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
  );

/** Validates any input against a schema; a mismatch becomes a 422 listing every problem. */
export const parseWith = <S extends z.ZodType>(schema: S, input: unknown): Parsed<z.output<S>> => {
  const result = schema.safeParse(input);
  return result.success
    ? { ok: true, data: result.data }
    : {
        ok: false,
        response: json(
          errorBody('http.invalid-input', 'The request is not valid.', issues(result.error)),
          422,
        ),
      };
};

/** Reads a JSON body with a size limit, then validates it. The body is never logged. */
export const readJson = async <S extends z.ZodType>(
  request: Request,
  schema: S,
  maxBytes: number = MAX_BODY_BYTES,
): Promise<Parsed<z.output<S>>> => {
  const text = await request.text();
  if (text.length > maxBytes) {
    return {
      ok: false,
      response: json(errorBody('http.too-large', 'The request is too large.'), 413),
    };
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return {
      ok: false,
      response: json(errorBody('http.invalid-json', 'The body must be JSON.'), 400),
    };
  }
  return parseWith(schema, body);
};

export const queryOf = (request: Request): Record<string, string> =>
  Object.fromEntries(new URL(request.url).searchParams);

/** The `:list` segment of `/api/lists/:list/...`. */
export const listParam = (request: Request): string =>
  decodeURIComponent(new URL(request.url).pathname.split('/')[3] ?? '');

/** Drops keys whose value is `undefined`, for exact optional properties. */
export const defined = <T extends object>(value: T): { [K in keyof T]: Exclude<T[K], undefined> } =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
