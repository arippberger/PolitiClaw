// Small TypeBox runtime-validation helpers.
//
// TypeBox ships its `Value.Check` and `Value.Errors` primitives as the
// foundation, but the surface plugin code wants is `safeParse(schema, x)`
// returning a discriminated `{ ok, ... }` and `parse(schema, x)` throwing.
// These wrappers preserve the call-site shape we used to get from Zod's
// `.safeParse()` / `.parse()` so the migration is a 1:1 rewrite at every
// call site instead of a re-architecture.
//
// Error formatting: TypeBox's `Value.Errors` yields `{ path, message, ... }`
// records where `path` is a JSON-pointer-ish string ("/anchor/billId") or
// empty for the root. We render them as `path: message`, joined with `; `,
// matching the pattern the dashboard JS and the tools' `Invalid input: ...`
// output were already producing from Zod's `issues.map((i) => i.message)`.

import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export type SafeParseSuccess<T> = { ok: true; data: T };
export type SafeParseFailure = { ok: false; messages: string[] };
export type SafeParseResult<T> = SafeParseSuccess<T> | SafeParseFailure;

function collectErrors(schema: TSchema, value: unknown): string[] {
  const messages: string[] = [];
  for (const error of Value.Errors(schema, value)) {
    const where = error.path && error.path.length > 0 ? error.path : "value";
    messages.push(`${where}: ${error.message}`);
  }
  return messages;
}

/**
 * Validate `value` against `schema` without throwing. The schema is *not*
 * mutated and `value` is returned as-is on success — TypeBox does not coerce
 * or transform inputs, so any normalization (trim, lowercase, etc.) must
 * happen at the call site before invoking this helper.
 */
export function safeParse<S extends TSchema>(
  schema: S,
  value: unknown,
): SafeParseResult<Static<S>> {
  if (Value.Check(schema, value)) {
    return { ok: true, data: value as Static<S> };
  }
  return { ok: false, messages: collectErrors(schema, value) };
}

/**
 * Validate `value` and return it typed; throw if invalid. Intended for code
 * paths that consider validation failure a programming error or boundary
 * violation (e.g., `upsertPreferences` after the caller has already vetted
 * the shape). Use {@link safeParse} when you need to render an error to
 * the user.
 */
export function parse<S extends TSchema>(schema: S, value: unknown): Static<S> {
  if (Value.Check(schema, value)) {
    return value as Static<S>;
  }
  const messages = collectErrors(schema, value);
  throw new Error(`Validation failed: ${messages.join("; ")}`);
}
