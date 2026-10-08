declare const brand: unique symbol;

/** A nominal type: a `T` that only code which validated it can produce. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };
