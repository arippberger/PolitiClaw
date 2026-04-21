import { z } from "zod";

export const MUTE_KINDS = ["bill", "rep", "issue"] as const;

export const MuteKindSchema = z.enum(MUTE_KINDS);

export type MuteKind = z.infer<typeof MuteKindSchema>;

export const MuteInputSchema = z.object({
  kind: MuteKindSchema,
  ref: z.string().trim().min(1, "ref is required"),
  reason: z.string().trim().min(1).optional(),
});

export type MuteInput = z.infer<typeof MuteInputSchema>;

export const UnmuteInputSchema = MuteInputSchema.omit({ reason: true });

export type UnmuteInput = z.infer<typeof UnmuteInputSchema>;

export type MuteRow = {
  kind: MuteKind;
  ref: string;
  reason: string | null;
  mutedAt: number;
};
