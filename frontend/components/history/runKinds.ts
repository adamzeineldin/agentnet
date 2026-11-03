/** Run types in plain words, for the run list and its filters. */
export const RUN_KIND: Record<string, { title: string; filter: string }> = {
  discover: { title: "Learned a task", filter: "Learned a task" },
  transfer: { title: "Learned from another robot", filter: "Learned from another robot" },
  real_replay: { title: "Replayed a real recording", filter: "Real recordings" },
  motion_check: { title: "Motion check", filter: "Motion checks" },
  benchmark: { title: "Comparison run", filter: "Comparisons" },
};
