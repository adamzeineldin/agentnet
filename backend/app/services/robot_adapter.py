"""RobotAdapter: everything Nimbotics knows about an arm, read from the compiled model.

Arm joints are discovered by walking the kinematic chain from the end-effector
site to the world body. Actuators are mapped by joint transmission and must be
position servos (gain = kp, bias = [0, -kp, -kv]) so that ctrl is a joint
position target. Nothing about link lengths or joint names is hard-coded.
"""

from __future__ import annotations

from dataclasses import dataclass

import mujoco
import numpy as np

from app.services.robot_catalog import RobotDecl
from app.services.scene import FLOOR_GEOM, OBSTACLE_PREFIX

_JOINT_TYPE_NAMES = {
    int(mujoco.mjtJoint.mjJNT_HINGE): "hinge",
    int(mujoco.mjtJoint.mjJNT_SLIDE): "slide",
}


@dataclass(frozen=True)
class ArmJoint:
    name: str
    joint_id: int
    qpos_adr: int
    dof_adr: int
    joint_type: str
    limited: bool
    lower: float
    upper: float


@dataclass(frozen=True)
class ArmActuator:
    name: str
    actuator_id: int
    joint_name: str
    control_mode: str
    kp: float
    kv: float
    ctrl_range: tuple[float, float]
    force_range: tuple[float, float]


@dataclass(frozen=True)
class Contact:
    geom1: str
    geom2: str
    body1: str
    body2: str
    category: str  # "obstacle" | "self" | "floor" | "environment"
    distance: float


class RobotAdapter:
    def __init__(self, decl: RobotDecl, model: mujoco.MjModel) -> None:
        self.decl = decl
        self.model = model
        self.ee_site_id = self._require_id(mujoco.mjtObj.mjOBJ_SITE, decl.end_effector.site_name)
        self.ee_body_id = int(model.site_bodyid[self.ee_site_id])
        self.joints = self._discover_arm_joints()
        self.actuators = self._map_actuators()
        self.robot_body_ids = self._robot_body_ids()
        self.base_body_id = self._base_body_id()
        self.home_key_id = self._require_id(mujoco.mjtObj.mjOBJ_KEY, decl.home_keyframe)
        self.qpos_idx = np.array([j.qpos_adr for j in self.joints])
        self.dof_idx = np.array([j.dof_adr for j in self.joints])
        self.lower = np.array([j.lower for j in self.joints])
        self.upper = np.array([j.upper for j in self.joints])
        self.actuator_idx = np.array([a.actuator_id for a in self.actuators])
        self.kp = np.array([a.kp for a in self.actuators])
        self.ctrl_lower = np.array([a.ctrl_range[0] for a in self.actuators])
        self.ctrl_upper = np.array([a.ctrl_range[1] for a in self.actuators])

    # ------------------------------------------------------------------ discovery
    def _require_id(self, obj: mujoco.mjtObj, name: str) -> int:
        idx = mujoco.mj_name2id(self.model, obj, name)
        if idx < 0:
            raise ValueError(f"{obj.name} '{name}' not found in model for {self.decl.robot_id}")
        return int(idx)

    def _discover_arm_joints(self) -> tuple[ArmJoint, ...]:
        m = self.model
        chain: list[int] = []
        body = self.ee_body_id
        while body != 0:
            chain.append(body)
            body = int(m.body_parentid[body])
        joints: list[ArmJoint] = []
        for b in reversed(chain):
            for jid in range(m.body_jntadr[b], m.body_jntadr[b] + m.body_jntnum[b]):
                jtype = int(m.jnt_type[jid])
                if jtype not in _JOINT_TYPE_NAMES:
                    continue
                lo, hi = (float(v) for v in m.jnt_range[jid])
                limited = bool(m.jnt_limited[jid])
                if not limited:
                    lo, hi = -np.pi, np.pi
                joints.append(
                    ArmJoint(
                        name=m.joint(jid).name,
                        joint_id=jid,
                        qpos_adr=int(m.jnt_qposadr[jid]),
                        dof_adr=int(m.jnt_dofadr[jid]),
                        joint_type=_JOINT_TYPE_NAMES[jtype],
                        limited=limited,
                        lower=lo,
                        upper=hi,
                    )
                )
        if not joints:
            raise ValueError(f"No arm joints found on chain to EE for {self.decl.robot_id}")
        return tuple(joints)

    def _map_actuators(self) -> tuple[ArmActuator, ...]:
        m = self.model
        result: list[ArmActuator] = []
        for joint in self.joints:
            match = [
                a
                for a in range(m.nu)
                if m.actuator_trntype[a] == mujoco.mjtTrn.mjTRN_JOINT
                and m.actuator_trnid[a][0] == joint.joint_id
            ]
            if len(match) != 1:
                raise ValueError(f"Joint {joint.name} has {len(match)} joint actuators; need 1")
            a = match[0]
            kp = float(m.actuator_gainprm[a][0])
            bias = m.actuator_biasprm[a]
            is_servo = (
                m.actuator_gaintype[a] == mujoco.mjtGain.mjGAIN_FIXED
                and m.actuator_biastype[a] == mujoco.mjtBias.mjBIAS_AFFINE
                and np.isclose(bias[0], 0.0)
                and np.isclose(bias[1], -kp)
            )
            if not is_servo:
                raise ValueError(f"Actuator {m.actuator(a).name} is not a position servo")
            result.append(
                ArmActuator(
                    name=m.actuator(a).name,
                    actuator_id=a,
                    joint_name=joint.name,
                    control_mode="position_servo",
                    kp=kp,
                    kv=float(-bias[2]),
                    ctrl_range=(float(m.actuator_ctrlrange[a][0]), float(m.actuator_ctrlrange[a][1])),
                    force_range=(
                        float(m.actuator_forcerange[a][0]),
                        float(m.actuator_forcerange[a][1]),
                    ),
                )
            )
        return tuple(result)

    def _base_body_id(self) -> int:
        body = self.ee_body_id
        while int(self.model.body_parentid[body]) != 0:
            body = int(self.model.body_parentid[body])
        return body

    def _robot_body_ids(self) -> frozenset[int]:
        m = self.model
        root = self.ee_body_id
        while int(m.body_parentid[root]) != 0:
            root = int(m.body_parentid[root])
        return frozenset(b for b in range(1, m.nbody) if int(m.body_rootid[b]) == root)

    # ------------------------------------------------------------------ state
    @property
    def dof(self) -> int:
        return len(self.joints)

    def new_data(self) -> mujoco.MjData:
        data = mujoco.MjData(self.model)
        self.reset_home(data)
        return data

    def reset_home(self, data: mujoco.MjData) -> None:
        mujoco.mj_resetDataKeyframe(self.model, data, self.home_key_id)
        mujoco.mj_forward(self.model, data)

    def reset_to(self, data: mujoco.MjData, q: np.ndarray) -> None:
        """Home keyframe (ctrl, gripper) with the arm placed at q, at rest."""
        mujoco.mj_resetDataKeyframe(self.model, data, self.home_key_id)
        self.set_arm_q(data, q)
        data.qvel[:] = 0.0
        mujoco.mj_forward(self.model, data)

    def home_q(self) -> np.ndarray:
        return self.model.key_qpos[self.home_key_id][self.qpos_idx].copy()

    def arm_q(self, data: mujoco.MjData) -> np.ndarray:
        return data.qpos[self.qpos_idx].copy()

    def set_arm_q(self, data: mujoco.MjData, q: np.ndarray) -> None:
        data.qpos[self.qpos_idx] = q

    def servo_command(
        self, data: mujoco.MjData, q_target: np.ndarray, gravity_comp: bool = True
    ) -> np.ndarray:
        """ctrl values for the position servos to track q_target.

        With gravity_comp, the servo setpoint is offset by qfrc_bias / kp so the
        servo's steady-state force cancels gravity and Coriolis terms computed
        by MuJoCo for the current simulated state.
        """
        ctrl = q_target + (data.qfrc_bias[self.dof_idx] / self.kp if gravity_comp else 0.0)
        return np.clip(ctrl, self.ctrl_lower, self.ctrl_upper)

    def within_limits(self, q: np.ndarray, tol: float = 1e-6) -> bool:
        return bool(np.all(q >= self.lower - tol) and np.all(q <= self.upper + tol))

    def limit_violations(self, q: np.ndarray, tol: float = 1e-3) -> list[str]:
        return [
            j.name
            for j, v in zip(self.joints, q, strict=True)
            if v < j.lower - tol or v > j.upper + tol
        ]

    # ------------------------------------------------------------------ kinematics
    def fk(self, data: mujoco.MjData, q: np.ndarray | None = None) -> np.ndarray:
        """End-effector site position. If q is given, runs kinematics for q first."""
        if q is not None:
            self.set_arm_q(data, q)
            mujoco.mj_kinematics(self.model, data)
        return data.site_xpos[self.ee_site_id].copy()

    def ee_jacobian_pos(self, data: mujoco.MjData) -> np.ndarray:
        """3 x dof translational Jacobian at the current kinematic state."""
        mujoco.mj_comPos(self.model, data)
        jacp = np.zeros((3, self.model.nv))
        mujoco.mj_jacSite(self.model, data, jacp, None, self.ee_site_id)
        return jacp[:, self.dof_idx]

    def base_position(self, data: mujoco.MjData) -> np.ndarray:
        return data.xpos[self.base_body_id].copy()

    # ------------------------------------------------------------------ collisions
    def contacts(self, data: mujoco.MjData) -> list[Contact]:
        """Classify current contacts. Requires mj_forward/mj_collision to have run."""
        m = self.model
        found: list[Contact] = []
        for i in range(data.ncon):
            c = data.contact[i]
            g1, g2 = int(c.geom[0]), int(c.geom[1])
            b1, b2 = int(m.geom_bodyid[g1]), int(m.geom_bodyid[g2])
            in_robot = (b1 in self.robot_body_ids, b2 in self.robot_body_ids)
            if not any(in_robot):
                continue
            names = (m.geom(g1).name, m.geom(g2).name)
            if all(in_robot):
                category = "self"
            elif any(n.startswith(OBSTACLE_PREFIX) for n in names):
                category = "obstacle"
            elif FLOOR_GEOM in names:
                category = "floor"
            else:
                category = "environment"
            found.append(
                Contact(
                    geom1=names[0] or f"geom{g1}",
                    geom2=names[1] or f"geom{g2}",
                    body1=m.body(b1).name,
                    body2=m.body(b2).name,
                    category=category,
                    distance=float(c.dist),
                )
            )
        return found

    def check_configuration(self, data: mujoco.MjData, q: np.ndarray) -> list[Contact]:
        """Geometric screening: contacts at configuration q (no dynamics)."""
        self.set_arm_q(data, q)
        mujoco.mj_kinematics(self.model, data)
        mujoco.mj_collision(self.model, data)
        return self.contacts(data)
