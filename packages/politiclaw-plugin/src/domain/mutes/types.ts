import { type Static, Type } from "@sinclair/typebox";

export const MUTE_KINDS = ["bill", "rep", "issue"] as const;

export const MuteKindSchema = Type.Union([
  Type.Literal("bill"),
  Type.Literal("rep"),
  Type.Literal("issue"),
]);

export type MuteKind = Static<typeof MuteKindSchema>;

/**
 * Schema for mute input *after* the caller has trimmed `ref` and `reason`.
 * Trim happens in `addMute` (see ./index.ts).
 */
export const MuteInputSchema = Type.Object({
  kind: MuteKindSchema,
  ref: Type.String({ minLength: 1 }),
  reason: Type.Optional(Type.String({ minLength: 1 })),
});

export type MuteInput = Static<typeof MuteInputSchema>;

export const UnmuteInputSchema = Type.Omit(MuteInputSchema, ["reason"]);

export type UnmuteInput = Static<typeof UnmuteInputSchema>;

export type MuteRow = {
  kind: MuteKind;
  ref: string;
  reason: string | null;
  mutedAt: number;
};
