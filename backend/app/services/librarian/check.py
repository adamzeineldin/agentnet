"""The librarian check and the improvement verdict (rules only, no model call).

`check` reads the published registry before any learning starts and returns one of three cases (models/learning.py).
`judge` compares a new verified motion with the robot's existing one on the same layout; the new one is kept only
when it is safe and measurably better, never because it came from another robot.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence

import numpy as np

from app.models.learning import ImprovementVerdict, LearningCheck, SkillMetrics
from app.models.robot import RobotSummary
from app.models.run import RunRecord
from app.models.skill import ExperienceCapsule
from app.services.route_planner import MIN_CLEARANCE_M
from app.services.task_families import TASK_TYPES, family_of

MAX_SOURCES = 3
# A new motion must beat the existing one by this share on time or path, and be no worse than it on the other.
IMPROVE_MARGIN = 0.02
VERDICT_BASIS = (f"Kept only if verified in MuJoCo on the same layout, collision-free, at least "
                 f"{MIN_CLEARANCE_M * 1000:.0f} mm from every obstacle, and at least {IMPROVE_MARGIN:.0%} faster or "
                 f"shorter without being more than {IMPROVE_MARGIN:.0%} worse on the other measure.")


def path_length(points: Sequence[Sequence[float]]) -> float:
    if len(points) < 2:
        return 0.0
    return float(np.linalg.norm(np.diff(np.asarray(points, dtype=float), axis=0), axis=1).sum())


def metrics(s: ExperienceCapsule) -> SkillMetrics:
    trace = s.executed_trace_task_frame if len(s.executed_trace_task_frame) >= 2 else s.waypoints_task_frame
    learned_from = s.provenance.get("transferred_from_robot") if s.parent_skill_id else None
    return SkillMetrics(
        skill_id=s.skill_id, robot_id=s.source_robot_id, run_id=s.provenance.get("run_id"), scene_id=s.task.scene_id,
        route=f"{s.strategy.route_class}@{s.strategy.clearance_m:.2f}", execution_s=s.validation.simulated_seconds,
        path_length_m=path_length(trace), endpoint_error_m=s.validation.endpoint_error_m,
        min_clearance_m=s.validation.min_clearance_m, collisions=s.validation.collisions,
        learned_from=str(learned_from) if learned_from else None,
    )


def _of_family(skills: Iterable[ExperienceCapsule], family: str) -> list[ExperienceCapsule]:
    return [s for s in skills if s.validation.success and family_of(s.task.scene_id) == family]


def _fastest(skills: Iterable[ExperienceCapsule]) -> ExperienceCapsule | None:
    ranked = sorted(skills, key=lambda s: (s.validation.simulated_seconds, path_length(s.executed_trace_task_frame),
                                           -s.created_at.timestamp()))
    return ranked[0] if ranked else None


def rank_sources(skills: Sequence[ExperienceCapsule], robot: RobotSummary,
                 robots: Sequence[RobotSummary]) -> list[ExperienceCapsule]:
    """Other robots' skills, one per robot (its fastest), most similar body first, then smallest endpoint error."""
    bodies = {r.robot_id: r for r in robots}
    per_robot: dict[str, list[ExperienceCapsule]] = {}
    for s in skills:
        if s.source_robot_id != robot.robot_id and s.source_robot_id in bodies:
            per_robot.setdefault(s.source_robot_id, []).append(s)
    best = [_fastest(group) for group in per_robot.values()]

    def likeness(s: ExperienceCapsule) -> tuple[float, float, str]:
        other = bodies[s.source_robot_id]
        body = abs(other.dof - robot.dof) + abs(other.max_reach_m - robot.max_reach_m) / max(robot.max_reach_m, 1e-6)
        return body, s.validation.endpoint_error_m, s.skill_id

    return sorted((s for s in best if s is not None), key=likeness)


def tried_on(runs: Iterable[RunRecord], robot_id: str, scene_id: str) -> set[str]:
    """Source skills already adapted onto this robot on this layout (any result): trying them again repeats work."""
    return {str(r.results.get("source_skill_id")) for r in runs
            if r.run_type == "transfer" and r.target_robot_id == robot_id and r.results.get("source_skill_id")
            and r.results.get("scene_id", (r.results.get("task") or {}).get("scene_id")) == scene_id}


def _name(robots: Sequence[RobotSummary], rid: str | None) -> str:
    return next((r.short_name for r in robots if r.robot_id == rid), rid or "")


def check(robot: RobotSummary, family: str, robots: Sequence[RobotSummary], skills: Sequence[ExperienceCapsule],
          runs: Sequence[RunRecord] = (), requested: str | None = None) -> LearningCheck:
    title = TASK_TYPES[family].title if family in TASK_TYPES else family
    verified = _of_family(skills, family)
    own = _fastest(s for s in verified if s.source_robot_id == robot.robot_id)
    others = rank_sources(verified, robot, robots)
    me, asked = robot.short_name, _name(robots, requested)
    asked_has = requested is not None and any(s.source_robot_id == requested for s in others)
    base = {"robot_id": robot.robot_id, "task_family": family, "task_title": title, "requested_robot_id": requested}

    if own is not None:
        tried = tried_on(runs, robot.robot_id, own.task.scene_id)
        fresh = [s for s in others if s.skill_id not in tried]
        if asked_has:  # what the user asked for goes first among the improvement attempts
            fresh.sort(key=lambda s: s.source_robot_id != requested)
        note = (f"The {me} already knows this, so nothing was retrained. "
                + (f"The {asked}'s skill can still be tried as an improvement." if asked_has
                   else f"The {asked} has no saved skill of this task.")) if requested else None
        return LearningCheck(**base, case="known", existing=metrics(own),
                             improve_sources=[metrics(s) for s in fresh[:MAX_SOURCES]],
                             already_tried=sorted(tried), requested_note=note,
                             reason=f"The {me} already has a simulation-verified skill for this task. Replay it, or "
                                    "try to improve it with other robots' experience.")
    if others:
        if asked_has:
            others.sort(key=lambda s: s.source_robot_id != requested)
        note = None
        if requested and not asked_has:
            note = (f"The {asked} has no saved skill of this task. The {_name(robots, others[0].source_robot_id)} "
                    "does, so its skill is used instead.")
        lead = _name(robots, others[0].source_robot_id)
        return LearningCheck(**base, case="adapt", sources=[metrics(s) for s in others[:MAX_SOURCES]],
                             requested_note=note,
                             reason=f"The {me} hasn't learned this yet, but the {lead} has. Its skill is adapted to "
                                    f"the {me}'s own joints and limits, then tested in simulation.")
    note = (f"The {asked} has no saved skill of this task, and no other robot has one either, so there is nothing "
            f"to learn from. The {me} can learn it directly instead.") if requested else None
    return LearningCheck(**base, case="learn", requested_note=note,
                         reason=f"No robot in the library knows this task yet. The {me} learns it directly in "
                                "simulation; once verified, it is saved so other robots can learn from it.")


def judge(existing: ExperienceCapsule, candidate: ExperienceCapsule | None) -> ImprovementVerdict:
    """Keep the existing skill unless the candidate is verified on the same layout, safe, and measurably better."""
    old = metrics(existing)
    if candidate is None:
        return ImprovementVerdict(existing=old, candidate=None, better=False, kept_skill_id=old.skill_id,
                                  reasons=["The adapted motion did not pass the physics test, so the existing skill "
                                           "is kept."], basis=VERDICT_BASIS)
    new = metrics(candidate)
    problems = [text for bad, text in (
        (not candidate.validation.success, "it is not a verified success"),
        (candidate.task.scene_id != existing.task.scene_id, "it was tested on a different layout"),
        (new.collisions > 0, f"it touched an obstacle {new.collisions} times"),
        (new.min_clearance_m < MIN_CLEARANCE_M, f"it passed {new.min_clearance_m * 1000:.0f} mm from an obstacle"),
    ) if bad]
    if problems:
        return ImprovementVerdict(existing=old, candidate=new, better=False, kept_skill_id=old.skill_id,
                                  reasons=[f"Not used: {'; '.join(problems)}."], basis=VERDICT_BASIS)
    dt = _change(new.execution_s, old.execution_s)
    dp = _change(new.path_length_m, old.path_length_m)
    reasons = [f"Execution time {old.execution_s:.2f} s → {new.execution_s:.2f} s ({dt:+.0%}).",
               f"Hand path {old.path_length_m:.3f} m → {new.path_length_m:.3f} m ({dp:+.0%})."]
    better = (dt <= -IMPROVE_MARGIN and dp <= IMPROVE_MARGIN) or (dp <= -IMPROVE_MARGIN and dt <= IMPROVE_MARGIN)
    reasons.append("Better on the measures above, so it replaces the existing skill." if better
                   else "Not better enough, so the existing skill is kept.")
    return ImprovementVerdict(existing=old, candidate=new, better=better,
                              kept_skill_id=new.skill_id if better else old.skill_id, reasons=reasons,
                              basis=VERDICT_BASIS)


def _change(new: float, old: float) -> float:
    return (new - old) / old if old > 0 else 0.0
