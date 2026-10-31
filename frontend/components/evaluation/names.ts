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
