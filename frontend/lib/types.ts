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
  ctrl_range: [number, number];
  force_range: [number, number];
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
    source: "model" | "added_by_agentnet";
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
  run_type: "motion_check" | "discover" | "transfer" | "benchmark";
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
    trace_task?: Vec3[]; thumbnail?: string; future_index?: number;
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
export interface ReasoningProposal {
  kind: "propose" | "revise"; provider?: string; model_id?: string | null; ranking: string[];
  rationale?: string; notes?: string[]; error?: string | null;
  calls?: { kind: string; summary: string; latency_s: number; prompt_tokens: number | null; completion_tokens: number | null }[];
}
export interface ReasoningTrace {
  provider_requested: string; provider_used: string; model_id: string | null; fallback_error: string | null;
  proposals: ReasoningProposal[]; revisions: number; physics_budget: number; final_order: string[]; offline_order: string[];
  model_calls: number; prompt_tokens: number | null; completion_tokens: number | null; estimated_cost_usd: number | null;
  offline_expected_selection: string | null; comparison_basis: string; changed_selection_vs_offline: boolean;
}
