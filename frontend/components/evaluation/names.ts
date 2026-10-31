import type { Variant } from "@/lib/types";

/** Plain names for the three benchmark approaches; the raw ids stay visible next to them in the summary. */
export const VARIANT_NAME: Record<Variant, string> = {
  baseline_no_sharing: "No sharing",
  retarget_only: "Copy the route only",
  nimbotics_offline: "Nimbotics (shared experience)",
};

export const VARIANT_SHORT: Record<Variant, string> = {
  baseline_no_sharing: "No sharing",
  retarget_only: "Copy route only",
  nimbotics_offline: "Nimbotics",
};

const SUBSET_NAME: Record<string, string> = {
  common: "comparable", all: "all", wall_reach_v1: "wall", wall_roof_v1: "wall + roof",
};

export const subsetName = (k: string): string => SUBSET_NAME[k] ?? k;

/** What each approach actually does, for people who don't read code. */
export const VARIANT_PLAIN: Record<Variant, string> = {
  baseline_no_sharing: "The UR5e starts from scratch on every new layout, trying routes in a fixed order.",
  retarget_only: "The UR5e copies the Panda's route exactly and gives up if it doesn't fit its body.",
  nimbotics_offline: "The UR5e uses what the Panda learned to decide what to try first, then searches as usual.",
};
