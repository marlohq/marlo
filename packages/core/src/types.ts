export type MailReport = string;

export type EmptyObject = Record<string, never>;

// Utility types
export type Falsy = undefined | null | false | 0 | 0n | '';
export type KeysOf<T> = { [K in keyof T]?: unknown };
export type StrictOmit<T extends NonNullable<unknown>, K extends keyof T> = Omit<T, K>;
export type Simplify<T> = { [K in keyof T]: T[K] } & {};
export type Overwrite<T, U> = Simplify<Omit<T, keyof U> & U>;
export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredKeys<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
export type MaybePromise<T> = T | Promise<T>;
