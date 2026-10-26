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
