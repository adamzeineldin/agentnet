"""Hold every part of an uploaded robot that is not the chosen arm still (services/uploads.py, step 3).

The joints that are not kept are removed from the model, which welds their bodies to their parents at the model's
reference pose; a free-floating base is welded to the world at its home pose instead, as if the robot were
mounted. Whatever only drove a removed joint goes with it: motors, tendons, sensors and joint constraints. All
keyframes are rebuilt as one "home" (add_home) from the original home pose, mapped by joint and motor name.
Every change is returned as a note for the uploader; nothing is removed silently.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import mujoco
import numpy as np

KEPT_JOINT_TYPES = (int(mujoco.mjtJoint.mjJNT_HINGE), int(mujoco.mjtJoint.mjJNT_SLIDE))
NAMED_EXAMPLES = 3


class HoldStillError(ValueError):
    """The model cannot be simplified safely (unnamed parts, an element list that does not match the model)."""


@dataclass(frozen=True)
class Held:
    notes: tuple[str, ...]
    # Original home pose of every kept joint and motor, by name (rebuilt into the new "home" keyframe).
    home_qpos: dict[str, tuple[float, ...]] = field(default_factory=dict)
    home_ctrl: dict[str, float] = field(default_factory=dict)


def _home_source(model: mujoco.MjModel) -> tuple[np.ndarray, np.ndarray]:
    key = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_KEY, "home")
    if key >= 0:
        return model.key_qpos[key].copy(), model.key_ctrl[key].copy()
    return model.qpos0.copy(), np.zeros(model.nu)


def _qpos_width(model: mujoco.MjModel, j: int) -> int:
    return {int(mujoco.mjtJoint.mjJNT_FREE): 7, int(mujoco.mjtJoint.mjJNT_BALL): 4}.get(int(model.jnt_type[j]), 1)


def _aligned(items: list, count: int, name_of, what: str) -> list:  # noqa: ANN001 - MjSpec element lists
    """MjSpec lists elements in model order; check that before deleting by index."""
    if len(items) != count:
        raise HoldStillError(f"The model's {what} could not be matched to the compiled model.")
    for i, item in enumerate(items):
        if item.name and item.name != name_of(i):
            raise HoldStillError(f"The model's {what} could not be matched to the compiled model.")
    return items


def freeze(spec: mujoco.MjSpec, model: mujoco.MjModel, keep: set[int]) -> Held | None:
    """Remove every joint not in `keep` (and what only drives it). None when nothing needs holding."""
    frozen = {j for j in range(model.njnt) if j not in keep}
    if not frozen:
        return None
    qpos, ctrl = _home_source(model)
    notes: list[str] = []
    for j in sorted(frozen):
        if int(model.jnt_type[j]) != int(mujoco.mjtJoint.mjJNT_FREE):
            continue
        body = model.body(int(model.jnt_bodyid[j])).name
        if not body:
            raise HoldStillError("The free-floating base body needs a name in the model.")
        adr = int(model.jnt_qposadr[j])
        spec.body(body).pos = qpos[adr:adr + 3].tolist()
        spec.body(body).quat = qpos[adr + 3:adr + 7].tolist()
        notes.append(f"The free-floating base {body!r} is fixed at its home pose, as if the robot were mounted.")

    tendons = {t for t in range(model.ntendon) for w in range(model.tendon_adr[t], model.tendon_adr[t] + model.tendon_num[t])
               if int(model.wrap_type[w]) == int(mujoco.mjtWrap.mjWRAP_JOINT) and int(model.wrap_objid[w]) in frozen}
    joint_trn = (int(mujoco.mjtTrn.mjTRN_JOINT), int(mujoco.mjtTrn.mjTRN_JOINTINPARENT))
    actuators = {a for a in range(model.nu)
                 if (int(model.actuator_trntype[a]) in joint_trn and int(model.actuator_trnid[a][0]) in frozen)
                 or (int(model.actuator_trntype[a]) == int(mujoco.mjtTrn.mjTRN_TENDON)
                     and int(model.actuator_trnid[a][0]) in tendons)}
    by_type = {int(mujoco.mjtObj.mjOBJ_JOINT): frozen, int(mujoco.mjtObj.mjOBJ_TENDON): tendons,
               int(mujoco.mjtObj.mjOBJ_ACTUATOR): actuators}
    sensors = {s for s in range(model.nsensor)
               if int(model.sensor_objid[s]) in by_type.get(int(model.sensor_objtype[s]), set())}
    equalities = {e for e in range(model.neq)
                  if (int(model.eq_type[e]) == int(mujoco.mjtEq.mjEQ_JOINT)
                      and {int(model.eq_obj1id[e]), int(model.eq_obj2id[e])} & frozen)
                  or (int(model.eq_type[e]) == int(mujoco.mjtEq.mjEQ_TENDON)
                      and {int(model.eq_obj1id[e]), int(model.eq_obj2id[e])} & tendons)}

    kept_qpos = {model.joint(j).name: tuple(qpos[model.jnt_qposadr[j]:model.jnt_qposadr[j] + _qpos_width(model, j)])
                 for j in keep}
    kept_ctrl = {model.actuator(a).name: float(ctrl[a]) for a in range(model.nu)
                 if a not in actuators and model.actuator(a).name}
    for items, ids, count, name_of, what in (
        (list(spec.actuators), actuators, model.nu, lambda i: model.actuator(i).name, "motors"),
        (list(spec.sensors), sensors, model.nsensor, lambda i: model.sensor(i).name, "sensors"),
        (list(spec.equalities), equalities, model.neq, lambda i: model.equality(i).name, "constraints"),
        (list(spec.tendons), tendons, model.ntendon, lambda i: model.tendon(i).name, "tendons"),
        (list(spec.joints), frozen, model.njnt, lambda i: model.joint(i).name, "joints"),
    ):
        aligned = _aligned(items, count, name_of, what)
        for i in sorted(ids):
            spec.delete(aligned[i])
    for key in list(spec.keys):
        spec.delete(key)

    movable = sorted(j for j in frozen if int(model.jnt_type[j]) != int(mujoco.mjtJoint.mjJNT_FREE))
    if movable:
        names = [model.joint(j).name or f"joint {j}" for j in movable]
        more = f" and {len(names) - NAMED_EXAMPLES} more" if len(names) > NAMED_EXAMPLES else ""
        notes.append(f"Held {len(names)} joints outside the arm still at the model's reference pose "
                     f"({', '.join(names[:NAMED_EXAMPLES])}{more}).")
    dropped = len(actuators) + len(tendons) + len(sensors) + len(equalities)
    if dropped:
        notes.append(f"Removed {dropped} motors, tendons, sensors or constraints that only drove those joints.")
    return Held(notes=tuple(notes), home_qpos=kept_qpos, home_ctrl=kept_ctrl)


def add_home(spec: mujoco.MjSpec, held: Held) -> None:
    """One "home" keyframe on the simplified model: the original pose of every kept joint and motor.

    A position servo with no original value (one Nimbotics added) holds its joint's home angle.
    """
    model = spec.compile()
    qpos = model.qpos0.copy()
    for j in range(model.njnt):
        value = held.home_qpos.get(model.joint(j).name)
        if value is not None:
            adr = int(model.jnt_qposadr[j])
            qpos[adr:adr + len(value)] = value
    ctrl = np.zeros(model.nu)
    for a in range(model.nu):
        name = model.actuator(a).name
        if name in held.home_ctrl:
            ctrl[a] = held.home_ctrl[name]
        elif int(model.actuator_trntype[a]) == int(mujoco.mjtTrn.mjTRN_JOINT) \
                and int(model.jnt_type[model.actuator_trnid[a][0]]) in KEPT_JOINT_TYPES:
            ctrl[a] = qpos[model.jnt_qposadr[model.actuator_trnid[a][0]]]
    spec.add_key(name="home", qpos=qpos.tolist(), ctrl=ctrl.tolist())
