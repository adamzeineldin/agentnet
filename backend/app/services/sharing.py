"""Making a run, skill or uploaded robot public or private, together with what must change with it.

A public item may not lean on something private, so:
  public  also makes public the owner's private items it uses: a run's robots and the skill it adapted, a skill's
          run, ancestors and robot. A run and the skill saved from it always change together (the run holds the
          skill's draft). If something it uses is private to someone else, the change is refused.
  private also makes private the owner's public items that use it. If someone else's work uses it (their skill
          adapted from it, their run on the robot), the change is refused: their Library pages would break.
Only the owner changes visibility; work with no owner (sign-in off, before accounts) stays public.

No duplicates in the public Library: a skill for a robot and layout that already has a public skill goes public only
if it is measurably better than each of them (librarian.check.judge, the "Improve this skill" rule), and an uploaded
robot whose model (passports.model_dir_hash) is already public is refused. Making something public records who did
it (their public display name) and when; making it private clears both.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models.robot import StoredModel
from app.models.run import RunRecord
from app.models.sharing import ItemKind, SharedItem, Visibility, VisibilityPlan
from app.models.skill import ExperienceCapsule
from app.services.librarian.check import judge
from app.services.registry import Registry, utcnow
from app.services.robot_catalog import ROBOTS

# Dependents are found by scanning runs; enough for every run the registry holds today.
SCAN_LIMIT = 100_000


class SharingError(ValueError):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class _Node:
    kind: ItemKind
    id: str
    owner_id: str | None
    visibility: str
    label: str

    def item(self) -> SharedItem:
        return SharedItem(kind=self.kind, id=self.id, label=self.label)


class _Index:
    """One read of the registry for a plan (EVERYONE: the plan must see others' work to protect it)."""

    def __init__(self, registry: Registry) -> None:
        self.registry = registry
        self.runs = {r.run_id: r for r in registry.list_runs(limit=SCAN_LIMIT)}
        self.skills = {s.skill_id: s for s in registry.list_skills()}
        self.robots = registry.robot_access()
        self.publishers = registry.robot_publishers()
        self.models = {m.robot_id: m for m in (StoredModel.model_validate_json(r.facts_json)
                                               for r in registry.stored_models())}
        self.skill_of_run = {s.provenance.get("run_id"): s for s in self.skills.values()}

    def model_hash(self, robot_id: str) -> str | None:
        """The stored folder's hash of an uploaded robot (its passport for an arm, its facts for a stored model)."""
        if robot_id in self.models:
            return self.models[robot_id].model_hash
        passport = self.registry.get_passport(robot_id)
        return passport.model_hash if passport else None

    def robot_name(self, robot_id: str) -> str:
        return self.models[robot_id].name if robot_id in self.models else _robot_name(robot_id)

    def node(self, kind: ItemKind, item_id: str) -> _Node | None:
        if kind == "run" and (run := self.runs.get(item_id)):
            return _Node("run", run.run_id, run.owner_id, run.visibility, _run_label(run))
        if kind == "skill" and (skill := self.skills.get(item_id)):
            return _Node("skill", skill.skill_id, skill.owner_id, skill.visibility, _skill_label(skill))
        if kind == "robot" and item_id in self.robots:
            owner, visibility = self.robots[item_id]
            return _Node("robot", item_id, owner, visibility, _robot_label(item_id))
        return None

    def uses(self, node: _Node) -> list[_Node]:
        """What node needs to be visible to make sense."""
        found: list[_Node | None] = []
        if node.kind == "run":
            run = self.runs[node.id]
            found += [self.node("robot", rid) for rid in (run.source_robot_id, run.target_robot_id) if rid]
            found += [self.node("skill", run.skill_id)] if run.skill_id else []
            saved = self.skill_of_run.get(run.run_id)
            found += [self.node("skill", saved.skill_id)] if saved else []
        elif node.kind == "skill":
            skill = self.skills[node.id]
            found += [self.node("run", skill.provenance.get("run_id", ""))]
            found += [self.node("skill", sid) for sid in skill.lineage]
            found += [self.node("robot", skill.source_robot_id)]
        return [n for n in found if n is not None]

    def used_by(self, node: _Node) -> list[_Node]:
        """What stops making sense if node is hidden."""
        found: list[_Node | None] = []
        if node.kind == "robot":
            found += [self.node("run", r.run_id) for r in self.runs.values()
                      if node.id in (r.source_robot_id, r.target_robot_id)]
            found += [self.node("skill", s.skill_id) for s in self.skills.values() if s.source_robot_id == node.id]
        elif node.kind == "skill":
            skill = self.skills[node.id]
            found += [self.node("run", skill.provenance.get("run_id", ""))]
            found += [self.node("run", r.run_id) for r in self.runs.values() if r.skill_id == node.id]
            found += [self.node("skill", s.skill_id) for s in self.skills.values() if node.id in s.lineage]
        elif node.kind == "run":
            saved = self.skill_of_run.get(node.id)
            found += [self.node("skill", saved.skill_id)] if saved else []
        return [n for n in found if n is not None]


def plan(registry: Registry, kind: ItemKind, item_id: str, visibility: Visibility, user_id: str) -> VisibilityPlan:
    """What changing item to `visibility` would change. Raises SharingError when it may not happen."""
    index = _Index(registry)
    if kind == "robot" and item_id in ROBOTS and item_id not in index.robots:
        raise SharingError(409, "Catalog arms are always public.")
    node = index.node(kind, item_id)
    if node is None or (node.visibility != "public" and node.owner_id != user_id):
        raise SharingError(404, f"Unknown {kind} '{item_id}'")
    if node.owner_id is None:
        raise SharingError(409, "This was shared before accounts existed, so it stays public.")
    if node.owner_id != user_id:
        raise SharingError(403, f"Only the owner of this {kind} can change who sees it.")
    step = index.uses if visibility == "public" else index.used_by
    also = _closure(node, step, visibility, user_id)
    if visibility == "public":
        for n in (node, *also):
            problem = _duplicate(index, n)
            if problem:
                raise SharingError(409, problem)
    return VisibilityPlan(item=node.item(), visibility=visibility, also=[n.item() for n in also])


def _shared_by(name: str | None) -> str:
    return f" (shared by {name})" if name else ""


def _duplicate(index: _Index, node: _Node) -> str | None:
    """Why making node public would duplicate the public Library, or None."""
    if node.kind == "skill":
        skill = index.skills[node.id]
        for rival in index.skills.values():
            if (rival.visibility != "public" or rival.skill_id == skill.skill_id
                    or rival.source_robot_id != skill.source_robot_id or rival.task.scene_id != skill.task.scene_id):
                continue
            verdict = judge(rival, skill)
            if not verdict.better:
                return (f"The public Library already has the {_robot_name(skill.source_robot_id)}'s skill on "
                        f"{skill.task.scene_id}{_shared_by(rival.published_by)}, and this one is not measurably "
                        f"better: {' '.join(verdict.reasons)} It stays private.")
    if node.kind == "robot":
        digest = index.model_hash(node.id)
        for other, (_, visibility) in index.robots.items():
            if other != node.id and visibility == "public" and digest and index.model_hash(other) == digest:
                return (f"This model is already public as the {index.robot_name(other)}"
                        f"{_shared_by(index.publishers.get(other, (None, None))[0])}. It stays private.")
    return None


def _closure(start: _Node, step, visibility: Visibility, user_id: str) -> list[_Node]:  # noqa: ANN001 - a method
    """Every item reachable from start (by step) that is not yet at `visibility`; refuses others' items."""
    seen = {(start.kind, start.id)}
    todo, out = [start], []
    while todo:
        for nxt in step(todo.pop()):
            if (nxt.kind, nxt.id) in seen:
                continue
            seen.add((nxt.kind, nxt.id))
            # Someone else's item blocks hiding (whatever its own visibility: it was built on this) and blocks
            # sharing only while it is private.
            if nxt.owner_id != user_id and (visibility == "private" or nxt.visibility != "public"):
                raise SharingError(409, _blocked(nxt, visibility))
            if nxt.visibility == visibility or nxt.owner_id != user_id:
                continue
            out.append(nxt)
            todo.append(nxt)
    return out


def _blocked(node: _Node, visibility: Visibility) -> str:
    if visibility == "public":
        return f"It uses {node.label}, which its owner keeps private."
    return f"Someone else's work uses it ({node.label}), so it has to stay public."


def apply(registry: Registry, change: VisibilityPlan, published_by: str | None) -> VisibilityPlan:
    """Change every item in the plan; public items record published_by (a display name) and the time."""
    public = change.visibility == "public"
    by, at = (published_by, utcnow()) if public else (None, None)
    for item in [change.item, *change.also]:
        if item.kind == "run":
            run = registry.get_run(item.id)
            registry.save_run(run.model_copy(update={"visibility": change.visibility, "published_by": by,
                                                     "published_at": at}))
        elif item.kind == "skill":
            registry.set_skill_visibility(item.id, change.visibility, by, at)
        else:
            registry.set_robot_visibility(item.id, change.visibility, by, at)
    return change.model_copy(update={"applied": True})


def _robot_name(robot_id: str | None) -> str:
    decl = ROBOTS.get(robot_id or "")
    return decl.short_name if decl else (robot_id or "?")


def _run_label(run: RunRecord) -> str:
    robots = " → ".join(_robot_name(r) for r in (run.source_robot_id, run.target_robot_id) if r)
    return f"{run.run_type.replace('_', ' ')} run on {robots} ({run.created_at:%b %d, %H:%M})"


def _skill_label(skill: ExperienceCapsule) -> str:
    return f"{_robot_name(skill.source_robot_id)}'s skill on {skill.task.scene_id}"


def _robot_label(robot_id: str) -> str:
    return f"the robot {_robot_name(robot_id)}"
