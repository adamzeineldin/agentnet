"""Deterministic offline librarian: organizes published capsules by fixed, stated rules.

No model calls. Rules:
- duplicates: same source robot, identical task geometry and the same strategy (route class + clearance);
  the earliest published capsule is kept as the reference.
- collections: same scene family and route class.
- gaps: a robot with no skill in a scene family; an original skill (and its duplicates) with no
  adaptation on another robot. Each untransferred original yields one transfer suggestion.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence

from app.models.library import CoverageGap, DuplicateGroup, LibraryReport, LibrarySuggestion, SkillCollection
from app.models.skill import ExperienceCapsule
from app.services.registry import utcnow
from app.services.task_scene import family_of

PROVIDER = "offline_librarian"
NOTES = (
    "Offline librarian: fixed rules over published capsules; no model calls.",
    "Reports never edit, merge or delete skills, and suggestions are not executed.",
)

Group = list[ExperienceCapsule]


def new_report_id() -> str:
    return f"lib_{utcnow():%Y%m%d_%H%M%S}_{uuid.uuid4().hex[:6]}"


def strategy_label(c: ExperienceCapsule) -> str:
    return f"{c.strategy.route_class}@{c.strategy.clearance_m:.2f}"


def organize(skills: Iterable[ExperienceCapsule], robot_ids: Sequence[str]) -> LibraryReport:
    ordered = sorted(skills, key=lambda c: (c.created_at, c.skill_id))
    robots = sorted(robot_ids)
    groups = duplicate_groups(ordered)
    transfer_gaps, suggestions = untransferred(ordered, groups, robots)
    return LibraryReport(
        report_id=new_report_id(), created_at=utcnow(), provider=PROVIDER, skill_count=len(ordered),
        robot_ids=robots, collections=collections(ordered),
        duplicates=[_duplicate_entry(g) for g in groups if len(g) > 1],
        gaps=[*family_gaps(ordered, robots), *transfer_gaps], suggestions=suggestions, notes=list(NOTES),
    )


def duplicate_groups(ordered: Sequence[ExperienceCapsule]) -> list[Group]:
    """Groups in first-published order; each group's first capsule is the one kept."""
    groups: dict[tuple, Group] = {}
    for c in ordered:
        key = (c.source_robot_id, c.task.model_dump_json(), c.strategy.route_class, round(c.strategy.clearance_m, 4))
        groups[key] = [*groups.get(key, []), c]
    return list(groups.values())


def _duplicate_entry(group: Group) -> DuplicateGroup:
    keep = group[0]
    return DuplicateGroup(
        keep_skill_id=keep.skill_id, duplicate_skill_ids=[c.skill_id for c in group[1:]],
        robot_id=keep.source_robot_id, scene_id=keep.task.scene_id, strategy=strategy_label(keep),
        basis=(f"Same robot ({keep.source_robot_id}), identical task geometry ({keep.task.scene_id}) and strategy "
               f"{strategy_label(keep)}; keeping the earliest published."),
    )


def collections(ordered: Sequence[ExperienceCapsule]) -> list[SkillCollection]:
    buckets: dict[tuple[str, str], Group] = {}
    for c in ordered:
        key = (family_of(c.task.scene_id), c.strategy.route_class)
        buckets[key] = [*buckets.get(key, []), c]
    return [
        SkillCollection(
            collection_id=f"{family}:{route}", title=f"{route.replace('_', ' ')} routes · {family}",
            scene_family=family, route_class=route, skill_ids=[c.skill_id for c in members],
            robot_ids=sorted({c.source_robot_id for c in members}),
            basis="Same scene family and route class.",
        )
        for (family, route), members in sorted(buckets.items())
    ]


def family_gaps(ordered: Sequence[ExperienceCapsule], robots: Sequence[str]) -> list[CoverageGap]:
    have = {(c.source_robot_id, family_of(c.task.scene_id)) for c in ordered}
    families = sorted({family for _, family in have})
    return [
        CoverageGap(kind="robot_missing_family", robot_id=robot, scene_family=family,
                    detail=f"{robot} has no published skill in {family}.")
        for family in families for robot in robots if (robot, family) not in have
    ]


def untransferred(ordered: Sequence[ExperienceCapsule], groups: Sequence[Group],
                  robots: Sequence[str]) -> tuple[list[CoverageGap], list[LibrarySuggestion]]:
    gaps: list[CoverageGap] = []
    suggestions: list[LibrarySuggestion] = []
    for group in groups:
        keep = group[0]
        if keep.parent_skill_id is not None:
            continue
        ids = {c.skill_id for c in group}
        for robot in robots:
            if robot == keep.source_robot_id or _adapted_on(ordered, ids, robot):
                continue
            extra = f" or its {len(ids) - 1} duplicate(s)" if len(ids) > 1 else ""
            gaps.append(CoverageGap(
                kind="skill_not_transferred", robot_id=robot, scene_family=family_of(keep.task.scene_id),
                skill_id=keep.skill_id, detail=f"No {robot} adaptation of {keep.skill_id}{extra}."))
            suggestions.append(LibrarySuggestion(
                action="transfer", source_skill_id=keep.skill_id, target_robot_id=robot,
                reason=(f"{strategy_label(keep)} on {keep.task.scene_id} is verified on {keep.source_robot_id}; "
                        f"{robot} has no adaptation of it yet.")))
    return gaps, suggestions


def _adapted_on(ordered: Sequence[ExperienceCapsule], ancestor_ids: set[str], robot: str) -> bool:
    return any(
        c.source_robot_id == robot and ancestor_ids & {*c.lineage, c.parent_skill_id}
        for c in ordered
    )
