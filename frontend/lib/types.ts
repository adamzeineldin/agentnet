// Mirrors backend/app/models/*.py. Keep in sync with the Pydantic schemas.

export type Provenance = "declared" | "model" | "measured";
export type Vec3 = [number, number, number];

export interface Health {
  status: string;
  versions: { python: string; mujoco: string; numpy: string; menagerie_commit: string };
  reasoning: { mode: "offline" | "meta_configured"; model_id: string | null; label: string };
}

export interface RobotSummary {
  robot_id: string;
  display_name: string;
  short_name: string;
  dof: number;
  model_source: string;
  model_hash: string;
  tool_type: string;
  max_reach_m: number;
  fallback_model: boolean;
  snapshot_url: string;
  created_at: string;
  maker: string;
  controller: string | null;
}

export interface JointInfo {
  name: string;
  joint_id: number;
  joint_type: "hinge" | "slide";
  limited: boolean;
  lower: number;
  upper: number;
}

export interface ActuatorInfo {
  name: string;
  actuator_id: number;
  joint_name: string;
  control_mode: string;
  kp: number;
  kv: number;
  ctrl_range: [number, number] | null;
  force_range: [number, number] | null;
}

export interface CapabilityEvidence {
  task_type: string;
  status: "verified_in_sim" | "measured" | "unverified";
  provenance: Provenance;
  evidence: Record<string, number | string | boolean>;
  note: string;
}

export interface WorkspaceEstimate {
  method: string;
  seed: number;
  samples_requested: number;
  samples_collision_free: number;
  rejected_self_collision: number;
  rejected_floor_or_env: number;
  rejected_below_floor: number;
  bounds_min: Vec3;
  bounds_max: Vec3;
  max_reach_m: number;
  median_reach_m: number;
  reach_reference: string;
  points: Vec3[];
}

export interface RobotPassport {
  schema_version: string;
  robot_id: string;
  display_name: string;
  short_name: string;
  model_source: string;
  model_version: string;
  model_file: string;
  model_hash: string;
  mujoco_version: string;
  fallback_model: boolean;
  joint_names: string[];
  arm_joints: JointInfo[];
  dof: number;
  actuators: ActuatorInfo[];
  end_effector: {
    site_name: string;
    parent_body: string;
    source: "model" | "added_by_nimbotics";
    offset_m: Vec3;
    home_position: Vec3;
    note: string;
  };
  base_frame: { body: string; position: Vec3; convention: string };
  tool_type: string;
  home_qpos: number[];
  workspace: WorkspaceEstimate;
  capabilities: CapabilityEvidence[];
  simulation_assumptions: string[];
  calibration_status: string;
  field_provenance: Record<string, Provenance>;
  created_at: string;
  compute_seconds: number;
}

export type RunStatus =
  | "queued" | "profiling" | "retrieving" | "checking" | "proposing" | "planning"
  | "simulating" | "selecting" | "executing" | "verifying" | "publishing"
  | "succeeded" | "failed";

export interface RunEvent {
  at: string;
  status: RunStatus;
  message: string;
  data: Record<string, unknown>;
}

export interface RunRecord {
  run_id: string;
  run_type: "motion_check" | "discover" | "transfer" | "benchmark" | "real_replay";
  status: RunStatus;
  source_robot_id: string | null;
  target_robot_id: string | null;
  skill_id: string | null;
  task_seed: number;
  planner: string;
  model_used: string | null;
  simulator: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  wall_clock_seconds: number | null;
  simulated_seconds: number | null;
  collision_count: number | null;
  endpoint_error_m: number | null;
  candidate_summaries: Record<string, unknown>[];
  results: Record<string, unknown>;
  artifacts: Record<string, string>;
  events: RunEvent[];
  error: string | null;
  started_by: string | null;
}

export const TERMINAL: ReadonlySet<RunStatus> = new Set(["succeeded", "failed"]);

// ---- Skills (backend/app/models/skill.py)
export type RouteClass = "direct" | "over" | "near_side" | "far_side";
export type CandidateOutcome =
  | "unreachable" | "discontinuous_ik" | "collision" | "insufficient_clearance"
  | "physics_failure" | "feasible" | "verified" | "not_simulated";

export interface BoxSpec { name: string; center: Vec3; half_size: Vec3 }
export interface TaskSpec {
  scene_id: string; seed: number; start: Vec3; target: Vec3; obstacles: BoxSpec[]; description: string;
}
export interface Placement { translation: Vec3; yaw_rad: number; rationale: string }

export interface CandidateSummary {
  candidate_id: string;
  route_class: RouteClass;
  clearance_m: number;
  stage_reached: string;
  outcome: CandidateOutcome;
  reason: string;
  waypoints_task: Vec3[];
  joint_path_length_rad: number | null;
  ee_path_length_m: number | null;
  min_clearance_m: number | null;
  contacts: Record<string, unknown>[];
  physics: {
    endpoint_error_m: number; simulated_seconds: number; collisions: unknown[]; checks: Record<string, boolean>;
    trace_task?: Vec3[]; thumbnail?: string; video?: string; future_index?: number;
  } | null;
  cost: number | null;
  prior_rank?: number | null;
  prior_note?: string | null;
}

export interface ExperienceCapsule {
  schema_version: string;
  skill_id: string;
  version: number;
  parent_skill_id: string | null;
  lineage: string[];
  status: "verified_in_sim";
  source_robot_id: string;
  source_model_hash: string;
  task_type: string;
  goal: string;
  reference_frame: string;
  frame_convention: string;
  task: TaskSpec;
  placement: Placement;
  strategy: { route_class: RouteClass; clearance_m: number; description: string };
  waypoints_task_frame: Vec3[];
  executed_trace_task_frame: Vec3[];
  candidate_outcomes: Pick<CandidateSummary, "candidate_id" | "route_class" | "clearance_m" | "outcome" | "reason" | "cost" | "min_clearance_m">[];
  requirements: Record<string, unknown>;
  environment: Record<string, unknown>;
  provenance: Record<string, unknown>;
  validation: {
    success: boolean; collisions: number; endpoint_error_m: number; min_clearance_m: number;
    simulated_seconds: number; candidates_evaluated: number; candidates_verified: number; tolerance_m: number;
  };
  created_at: string;
}

export interface SkillDetail { capsule: ExperienceCapsule; ancestors: ExperienceCapsule[]; children: ExperienceCapsule[] }

export interface CompatibilityCheck { check: string; status: "pass" | "warn" | "fail" | "info"; detail: string }
export interface Adaptation {
  transferred_from_robot: string; source_strategy: string; strategy_preserved: boolean;
  prior_rank_of_selected: number; target_dof: number;
}
export interface SearchMetrics {
  candidates_total: number; feasible: number; physics_rollouts: number; verified: number;
  order_rank_of_first_feasible: number | null; rollouts_to_first_success: number | null;
  considered_order: string[]; simulated_order: string[];
}

export type ReasoningMode = "offline" | "meta";
export type ExecuteOn = "none" | "ursim";

export interface ControllerStatusInfo {
  label: string;
  configured: boolean;
  reachable: boolean;
  ready?: boolean;
  detail: string;
  controller_version?: string;
  robot_model?: string;
  remote_control?: boolean;
  safety_mode?: number;
}

export interface ControllerSample {
  t: number;
  q_cmd: number[];
  q: number[];
  tcp: number[];
}

/** results.controller_execution on a transfer run: the verified path streamed to URSim (not a physical arm). */
export interface ControllerExecution {
  kind: "ursim";
  label: string;
  status: "succeeded" | "failed";
  error: string | null;
  controller_version: string | null;
  robot_model: string | null;
  stream_hz: number;
  path_waypoints: number;
  commanded_samples: number;
  duration_s: number | null;
  final_joint_error_rad: number | null;
  path_deviation_rad: number | null;
  tcp_vs_model_mm: number | null;
  tcp_to_target_mm: number | null;
  safety_mode_before: number | null;
  safety_mode_after: number | null;
  protective_stopped: boolean;
  checks: Record<string, boolean>;
  trace: ControllerSample[];
  notes: string[];
}
export interface ReasoningProposal {
  kind: "propose" | "revise"; provider?: string; model_id?: string | null; ranking: string[];
  rationale?: string; notes?: string[]; error?: string | null;
  calls?: { kind: string; summary: string; latency_s: number; prompt_tokens: number | null; completion_tokens: number | null }[];
}
export interface ReasoningTrace {
  provider_requested: string; model_requested?: string | null; provider_used: string; model_id: string | null; fallback_error: string | null;
  proposals: ReasoningProposal[]; revisions: number; physics_budget: number; final_order: string[]; offline_order: string[];
  model_calls: number; prompt_tokens: number | null; completion_tokens: number | null; estimated_cost_usd: number | null;
  offline_expected_selection: string | null; comparison_basis: string; changed_selection_vs_offline: boolean;
}

export interface StoryStep { run: RunRecord; capsule: ExperienceCapsule | null }
export interface DemoStory { source: StoryStep | null; target: StoryStep | null; complete: boolean; note: string }

// ---- Evaluation (backend/app/services/evaluation.py)
export type Variant = "baseline_no_sharing" | "retarget_only" | "nimbotics_offline";
export interface EvalRow {
  variant: Variant; family: string; seed: number; scene_id: string; applicable: boolean; success: boolean;
  selected: string | null; kinematic_evaluations: number; physics_rollouts: number;
  rollouts_to_first_success: number | null; endpoint_error_m: number | null; collisions_in_rollouts: number;
  sim_steps: number; wall_time_s: number; api_calls: number; source_skill: string | null;
  source_strategy: string | null; note: string;
}
export interface EvalSummary {
  scenes: number; applicable: number; successes: number; success_rate: number | null;
  median_kinematic_evaluations: number | null; median_rollouts_to_first_success: number | null;
  median_endpoint_error_m: number | null; median_wall_time_s: number | null; total_sim_steps: number;
  collisions_in_rollouts: number; api_calls: number;
}
export interface Paired {
  scenes: number; both_succeeded: number; only_variant: number; only_baseline: number; neither: number;
  fewer_kinematic_evals: number; same_kinematic_evals: number; more_kinematic_evals: number;
}
export interface BenchmarkResults {
  protocol: Record<string, unknown> & { families: string[]; dev_seeds: number[]; eval_seeds: number[]; variants: Record<Variant, string> };
  dev_library: { scene_id: string; success: boolean; strategy: string | null }[];
  rows: EvalRow[];
  summary: Record<Variant, Record<string, EvalSummary>>;
  paired?: Partial<Record<Variant, Paired>>;
}

// ---- Skill librarian (backend/app/models/library.py)
export type LibrarianMode = "offline" | "meta";
export interface SkillCollection {
  collection_id: string; title: string; scene_family: string; route_class: string;
  skill_ids: string[]; robot_ids: string[]; basis: string; model_note: string | null;
}
export interface DuplicateGroup {
  keep_skill_id: string; duplicate_skill_ids: string[]; robot_id: string; scene_id: string; strategy: string; basis: string;
}
export interface CoverageGap {
  kind: "robot_missing_family" | "skill_not_transferred"; robot_id: string; scene_family: string;
  skill_id: string | null; detail: string;
}
export interface LibrarySuggestion { action: "transfer"; source_skill_id: string; target_robot_id: string; reason: string }
export interface ModelUsage {
  model_calls: number; prompt_tokens: number | null; completion_tokens: number | null; estimated_cost_usd: number | null;
}
export interface LibraryReport {
  schema_version: string; report_id: string; created_at: string;
  provider: "offline_librarian" | "meta_muse_spark"; provider_requested: string | null; model_id: string | null;
  fallback_error: string | null; skill_count: number; robot_ids: string[];
  collections: SkillCollection[]; duplicates: DuplicateGroup[]; gaps: CoverageGap[]; suggestions: LibrarySuggestion[];
  summary: string | null; priority_rationale: string | null; usage: ModelUsage | null; notes: string[];
}

export interface RealDataSource {
  dataset_id: string;
  title: string;
  url: string;
  revision: string;
  license: string;
  citation: string;
  recorded_robot: string;
  recorded_robot_id: string;
  fps: number;
  frame: string;
  state_fields: string[];
  notes: string[];
}

export interface RealEpisodeSummary {
  episode_index: number;
  task: string;
  frames: number;
  duration_s: number;
}

export interface RealEpisode extends RealEpisodeSummary {
  source: RealDataSource;
  ee_xyz: [number, number, number][];
  gripper: number[];
}

export interface RealDatasetSummary {
  source: RealDataSource;
  selection: string;
  imported_at: string;
  episodes: RealEpisodeSummary[];
}

/** results of a real_replay run (see backend services/real_data/replay.py). */
export interface RealReplayResults {
  real_data: {
    dataset_id: string; title: string; url: string; revision: string; license: string; recorded_robot: string;
    episode_index: number; task: string; recorded_frames: number; recorded_duration_s: number; fps: number;
  };
  embodiment: string;
  recorded_path: number[][];
  simulated_path?: number[][];
  path_points: number;
  replay_joint_speed_rad_s?: number;
  path_deviation?: { max_m: number; mean_m: number; tolerance_m: number };
  checks?: Record<string, boolean>;
  controller_execution?: ControllerExecution;
}

// ---- Fleet catalog and sign-in (backend/app/api/robots.py, auth.py)
export interface CatalogEntry {
  robot_id: string; display_name: string; short_name: string; maker: string; model_source: string;
  in_fleet: boolean; default_fleet: boolean;
}
export type AuthProvider = "google" | "github";
export interface AuthConfig { providers: AuthProvider[]; required: boolean }
export interface PublicUser { user_id: string; provider: AuthProvider; name: string; avatar_url: string | null }

export interface UploadResult { robot: RobotSummary; notes: string[] }

export interface ScoutPick { skill_id: string; source_robot_id: string; route: string; why: string }
export interface ScoutPlan {
  goal: string; robot_id: string; task_family: string; task_title: string; task_why: string;
  picks: ScoutPick[]; teacher_robot_id: string | null; teacher_why: string | null; summary: string | null;
  provider: "offline_scout" | "meta_muse_spark"; provider_requested: string; model_id: string | null;
  usage: { model_calls: number; prompt_tokens: number | null; completion_tokens: number | null; estimated_cost_usd: number | null } | null;
  fallback_error: string | null; notes: string[]; created_at: string;
}
