"""Robot uploads: a user's MJCF or URDF (or a zip with its meshes) becomes a fleet arm, or a stored model.

Pipeline (worker thread for everything that touches MuJoCo):
  1. unpack: size, file-count and extension limits; zip paths must stay inside the upload folder.
  2. check_xml: no DOCTYPE/entities, no plugins, every file reference relative and inside the folder.
  3. normalize: find the arm and its tool body, add what Nimbotics needs and record each addition:
     a tool site, one position servo per arm joint (only if the model has none), a "home" keyframe, a floor.
     Any robot may carry an arm: a humanoid, a dual-arm torso, a mobile base. The arm options are the limbs of
     MIN_DOF..MAX_DOF joints (branches below that, like fingers or a head, belong to the tool); with several the
     uploader picks one. Everything else is held still: its joints are removed (with the motors, tendons,
     sensors and constraints that use them), a free-floating base is fixed at its home pose, and each change is
     listed.
  4. verify: the RobotAdapter must accept it and the arm must hold its home pose in physics; then the
     passport is computed from the model like any catalog arm.
A robot with no usable arm (a quadruped, a wheeled base) can be kept as a model only: stored and shown, not run.
Nothing about the robot is assumed beyond what the upload declares (its name) and what is read from the model.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import re
import shutil
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import asdict, dataclass, replace
from pathlib import Path, PurePosixPath

import mujoco
import numpy as np

from app.config import UPLOAD_DIR
from app.services import hold_still, storage
from app.services.robot_catalog import ROBOTS, EndEffectorDecl, RobotDecl, register, unregister

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_UNPACKED_BYTES = 80 * 1024 * 1024
MAX_FILES = 400
MAX_UPLOADED_ROBOTS = 40
MODEL_EXTS = {".xml", ".urdf"}
ASSET_EXTS = {".stl", ".obj", ".msh", ".png"}
SCENE_FILE = "nimbotics_scene.xml"
TCP_SITE = "nimbotics_tcp"
MIN_DOF, MAX_DOF = 3, 10
SERVO_HZ = 5.0  # natural frequency of added position servos
HOLD_DRIFT_LIMIT_M = 0.005
ARM_JOINT_TYPES = (int(mujoco.mjtJoint.mjJNT_HINGE), int(mujoco.mjtJoint.mjJNT_SLIDE))
FILE_ATTRS = {"file", "filename", "meshdir", "texturedir", "assetdir"}
TCP_HINT = re.compile(r"tcp|attachment|flange|pinch|end_?effector|ee_site|grip", re.IGNORECASE)

log = logging.getLogger(__name__)


class UploadError(ValueError):
    """Shown to the user as is: says what is wrong with the upload and how to fix it."""


@dataclass(frozen=True)
class ArmOption:
    """One limb the uploader may use as the arm: pass `tool` back to choose it."""

    tool: str
    joints: int


class ArmChoiceNeeded(UploadError):
    """The robot has several limbs that could be the arm; the uploader picks one (or keeps it as a model only)."""

    def __init__(self, options: list[ArmOption]) -> None:
        super().__init__(f"This robot has {len(options)} limbs that could be the arm. Pick one, "
                         "or keep it as a model only.")
        self.options = options


@dataclass(frozen=True)
class Normalized:
    ee_site: str
    ee_body: str
    notes: tuple[str, ...]
    mount: tuple[float, float, float, float] | None = None


# ---------------------------------------------------------------- 1. unpack
def _safe_member(name: str) -> PurePosixPath:
    path = PurePosixPath(name.replace("\\", "/"))
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise UploadError(f"The zip contains an unsafe path: {name!r}")
    return path


def unpack(filename: str, data: bytes, dest: Path) -> list[str]:
    """Write the upload into dest; returns notes about skipped files."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise UploadError(f"The file is larger than {MAX_UPLOAD_BYTES // 2**20} MB.")
    suffix = Path(filename).suffix.lower()
    dest.mkdir(parents=True, exist_ok=False)
    if suffix in MODEL_EXTS:
        (dest / f"robot{suffix}").write_bytes(data)
        return []
    if suffix != ".zip":
        raise UploadError("Upload a MuJoCo .xml, a .urdf, or a .zip holding the model and its mesh files.")
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise UploadError("The .zip file could not be opened.") from exc
    members = [m for m in archive.infolist() if not m.is_dir()]
    if len(members) > MAX_FILES:
        raise UploadError(f"The zip holds more than {MAX_FILES} files.")
    if sum(m.file_size for m in members) > MAX_UNPACKED_BYTES:
        raise UploadError(f"The zip unpacks to more than {MAX_UNPACKED_BYTES // 2**20} MB.")
    skipped: list[str] = []
    for m in members:
        path = _safe_member(m.filename)
        if (m.external_attr >> 16) & 0o170000 == 0o120000:
            raise UploadError(f"The zip contains a symbolic link: {m.filename!r}")
        if path.suffix.lower() not in MODEL_EXTS | ASSET_EXTS or path.name.startswith("."):
            skipped.append(path.as_posix())
            continue
        target = dest.joinpath(*path.parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(m) as src, target.open("wb") as out:
            shutil.copyfileobj(src, out, length=MAX_UNPACKED_BYTES)
    return [f"Ignored {len(skipped)} file(s) that are not models or meshes."] if skipped else []


def find_model(dest: Path) -> Path:
    files = sorted(p for p in dest.rglob("*") if p.suffix.lower() in MODEL_EXTS)
    if not files:
        raise UploadError("No .xml or .urdf model was found in the upload.")
    urdfs = [p for p in files if p.suffix.lower() == ".urdf"]
    if len(urdfs) == 1:
        return urdfs[0]
    scenes = [p for p in files if p.name == "scene.xml"]
    if len(scenes) == 1:
        return scenes[0]
    included = {(p.parent / inc).resolve() for p in files for inc in _includes(p)}
    tops = [p for p in files if p.resolve() not in included]
    if len(tops) != 1:
        raise UploadError("The upload holds several top-level models; keep one (or name it scene.xml).")
    return tops[0]


def _includes(path: Path) -> list[str]:
    try:
        return [e.get("file", "") for e in ET.parse(path).getroot().iter("include")]
    except ET.ParseError:
        return []


# ---------------------------------------------------------------- 2. check_xml
def check_xml(dest: Path) -> None:
    for path in dest.rglob("*"):
        if path.suffix.lower() not in MODEL_EXTS:
            continue
        raw = path.read_bytes()
        if b"<!DOCTYPE" in raw or b"<!ENTITY" in raw:
            raise UploadError(f"{path.name}: DOCTYPE and entity declarations are not allowed.")
        try:
            root = ET.fromstring(raw)
        except ET.ParseError as exc:
            raise UploadError(f"{path.name} is not valid XML: {exc}") from exc
        for el in root.iter():
            if el.tag in ("plugin", "extension"):
                raise UploadError(f"{path.name}: MuJoCo plugins are not supported in uploads.")
            for attr, value in el.attrib.items():
                if attr in FILE_ATTRS:
                    _check_reference(path, dest, value)


def _check_reference(path: Path, dest: Path, value: str) -> None:
    ref = value.removeprefix("package://")
    if value.startswith("package://"):
        ref = PurePosixPath(ref).name  # URDF meshes are looked up by file name (MuJoCo strips package paths)
    pure = PurePosixPath(ref.replace("\\", "/"))
    if pure.is_absolute() or ".." in pure.parts or "://" in ref or ref.startswith("~"):
        raise UploadError(f"{path.name} refers to a file outside the upload: {value!r}")


def flatten_meshes(dest: Path) -> None:
    """URDF meshes are found by file name next to the model, so copy them there."""
    for p in list(dest.rglob("*")):
        if p.suffix.lower() in ASSET_EXTS and p.parent != dest and not (dest / p.name).exists():
            shutil.copy2(p, dest / p.name)


# ---------------------------------------------------------------- 3. normalize
def _joint_count(model: mujoco.MjModel, body: int) -> int:
    return sum(1 for j in range(model.body_jntadr[body], model.body_jntadr[body] + model.body_jntnum[body])
               if int(model.jnt_type[j]) in ARM_JOINT_TYPES)


def _subtree_joints(model: mujoco.MjModel) -> np.ndarray:
    counts = np.array([_joint_count(model, b) for b in range(model.nbody)])
    for b in range(model.nbody - 1, 0, -1):
        counts[model.body_parentid[b]] += counts[b]
    return counts


def arm_ends(model: mujoco.MjModel) -> list[int]:
    """Tool bodies of every limb that could be the arm, in model order.

    Walk down from each base: a single moving child continues the limb; at a fork, every branch holding at least
    MIN_DOF joints is a limb of its own (two arms, legs) and smaller branches belong to the tool (fingers, a head).
    A limb ends where it stops moving or forks into small branches; it counts if MIN_DOF..MAX_DOF joints lead to it.
    """
    sub = _subtree_joints(model)
    children: dict[int, list[int]] = {}
    for c in range(1, model.nbody):
        if sub[c] > 0:
            children.setdefault(int(model.body_parentid[c]), []).append(c)
    ends: list[int] = []
    todo = [b for b in children.get(0, [])]
    while todo:
        body = todo.pop(0)
        moving = children.get(body, [])
        limbs = [c for c in moving if sub[c] >= MIN_DOF]
        if len(moving) == 1:
            todo.insert(0, moving[0])
        elif not limbs:
            ends.append(body)
        else:
            todo[:0] = limbs
    return [b for b in ends if MIN_DOF <= len(_arm_joints(model, b)) <= MAX_DOF]


def _longest_limb(model: mujoco.MjModel) -> int:
    return max((len(_arm_joints(model, b)) for b in range(1, model.nbody)), default=0)


def arm_options(model: mujoco.MjModel) -> list[ArmOption]:
    return [ArmOption(tool=model.body(b).name, joints=len(_arm_joints(model, b))) for b in arm_ends(model)]


def _chain(model: mujoco.MjModel, body: int) -> list[int]:
    out = []
    while body != 0:
        out.append(body)
        body = int(model.body_parentid[body])
    return out[::-1]


def _arm_joints(model: mujoco.MjModel, tool_body: int) -> list[int]:
    return [j for b in _chain(model, tool_body)
            for j in range(model.body_jntadr[b], model.body_jntadr[b] + model.body_jntnum[b])
            if int(model.jnt_type[j]) in ARM_JOINT_TYPES]


def _in_subtree(model: mujoco.MjModel, body: int, root: int) -> bool:
    while body != 0:
        if body == root:
            return True
        body = int(model.body_parentid[body])
    return False


def _hold_still(spec: mujoco.MjSpec, model: mujoco.MjModel, tool: int) -> hold_still.Held | None:
    """Keep the arm and whatever rides on its tool (fingers); hold the rest of the robot still."""
    keep = set(_arm_joints(model, tool)) | {
        j for j in range(model.njnt)
        if int(model.jnt_type[j]) in ARM_JOINT_TYPES and _in_subtree(model, int(model.jnt_bodyid[j]), tool)}
    try:
        return hold_still.freeze(spec, model, keep)
    except hold_still.HoldStillError as exc:
        raise UploadError(str(exc)) from exc


def _add_home(spec: mujoco.MjSpec, held: hold_still.Held) -> None:
    try:
        hold_still.add_home(spec, held)
    except Exception as exc:  # noqa: BLE001 - a compile problem in the simplified model is the upload's
        raise UploadError(f"MuJoCo could not load the simplified model: {exc}") from exc


def _has_servos(model: mujoco.MjModel, joints: list[int]) -> bool:
    for j in joints:
        acts = [a for a in range(model.nu)
                if int(model.actuator_trntype[a]) == int(mujoco.mjtTrn.mjTRN_JOINT) and model.actuator_trnid[a][0] == j]
        if len(acts) != 1:
            return False
        a, kp = acts[0], model.actuator_gainprm[acts[0]][0]
        if not (int(model.actuator_biastype[a]) == int(mujoco.mjtBias.mjBIAS_AFFINE) and np.isclose(model.actuator_biasprm[a][1], -kp)):
            return False
    return True


def _resolve_tool(model: mujoco.MjModel, hint: str | None) -> tuple[int, str | None]:
    """(tool body, existing site name or None)."""
    if hint:
        sid = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_SITE, hint)
        if sid >= 0:
            return int(model.site_bodyid[sid]), hint
        bid = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, hint)
        if bid > 0:
            return bid, None
        raise UploadError(f"No site or body named {hint!r} in the model.")
    ends = arm_ends(model)
    if not ends:
        raise UploadError(f"No arm of {MIN_DOF} to {MAX_DOF} joints was found (the longest limb has "
                          f"{_longest_limb(model)}). You can keep it as a model only.")
    if len(ends) > 1:
        if any(not model.body(b).name for b in ends):
            raise UploadError("Every limb that could be the arm needs a body name in the model.")
        raise ArmChoiceNeeded(arm_options(model))
    tool = ends[0]
    on_chain = set(_chain(model, tool))
    for s in range(model.nsite):
        if TCP_HINT.search(model.site(s).name) and int(model.site_bodyid[s]) in on_chain | {tool}:
            if len(_arm_joints(model, int(model.site_bodyid[s]))) >= MIN_DOF:
                return int(model.site_bodyid[s]), model.site(s).name
    return tool, None


def _servo_gains(model: mujoco.MjModel, joints: list[int]) -> list[tuple[float, float]]:
    """kp, kv per joint from the largest joint-space inertia seen over random poses (critically damped)."""
    data = mujoco.MjData(model)
    rng = np.random.default_rng(0)
    full = np.zeros((model.nv, model.nv))
    peak = np.zeros(len(joints))
    for _ in range(16):
        for k, j in enumerate(joints):
            lo, hi = model.jnt_range[j] if model.jnt_limited[j] else (-np.pi, np.pi)
            data.qpos[model.jnt_qposadr[j]] = rng.uniform(lo, hi)
        mujoco.mj_forward(model, data)
        mujoco.mj_fullM(model, data, full)
        peak = np.maximum(peak, [full[model.jnt_dofadr[j], model.jnt_dofadr[j]] for j in joints])
    w = 2 * np.pi * SERVO_HZ
    return [(float(max(m * w * w, 1.0)), float(max(2 * m * w, 0.05))) for m in np.maximum(peak, 1e-4)]


def _add_floor(spec: mujoco.MjSpec) -> None:
    for g in list(spec.worldbody.geoms):
        if g.type == mujoco.mjtGeom.mjGEOM_PLANE:
            spec.delete(g)
    spec.add_texture(name="nimbotics_sky", type=mujoco.mjtTexture.mjTEXTURE_SKYBOX,
                     builtin=mujoco.mjtBuiltin.mjBUILTIN_GRADIENT, rgb1=[0.3, 0.5, 0.7], rgb2=[0, 0, 0],
                     width=512, height=3072)
    spec.add_texture(name="groundplane", type=mujoco.mjtTexture.mjTEXTURE_2D,
                     builtin=mujoco.mjtBuiltin.mjBUILTIN_CHECKER, mark=mujoco.mjtMark.mjMARK_EDGE,
                     rgb1=[0.2, 0.3, 0.4], rgb2=[0.1, 0.2, 0.3], markrgb=[0.8, 0.8, 0.8], width=300, height=300)
    mat = spec.add_material(name="groundplane", texrepeat=[5, 5], texuniform=True, reflectance=0.2)
    mat.textures[mujoco.mjtTextureRole.mjTEXROLE_RGB] = "groundplane"
    spec.worldbody.add_light(pos=[0, 0, 1.5], dir=[0, 0, -1], type=mujoco.mjtLightType.mjLIGHT_DIRECTIONAL)
    spec.worldbody.add_geom(name="floor", type=mujoco.mjtGeom.mjGEOM_PLANE, size=[0, 0, 0.05], material="groundplane")


def normalize(model_file: Path, dest: Path, tool_hint: str | None, replace_servos: bool = False) -> Normalized:
    """Write dest/SCENE_FILE: the uploaded model plus only what Nimbotics needs to drive it.

    replace_servos swaps the model's own arm actuators for Nimbotics servos (used when they cannot hold the arm).
    """
    spec = _load_spec(model_file)
    model = _compile(spec)
    tool, site = _resolve_tool(model, tool_hint)
    joints = _arm_joints(model, tool)
    if not MIN_DOF <= len(joints) <= MAX_DOF:
        raise UploadError(f"The arm from its base to {model.body(tool).name!r} has {len(joints)} joints; "
                          f"Nimbotics needs {MIN_DOF} to {MAX_DOF}.")
    if not model.body(tool).name:
        raise UploadError("The arm's tool body needs a name in the model.")
    notes = [f"Tool point: {'site ' + repr(site) if site else 'added at the origin of ' + repr(model.body(tool).name)}."]
    held = _hold_still(spec, model, tool)
    if held is not None:
        notes += held.notes
        tool_name = model.body(tool).name
        model = _compile(spec)
        tool = model.body(tool_name).id
        joints = _arm_joints(model, tool)
    if site is None:
        spec.body(model.body(tool).name).add_site(name=TCP_SITE, size=[0.008, 0, 0], rgba=[0.1, 0.9, 1.0, 0.9], group=2)
        site = TCP_SITE
    names = [model.joint(j).name for j in joints]
    if any(not n for n in names):
        raise UploadError("Every arm joint needs a name in the model.")
    # Said plainly because a limb may start on a moving base (a mobile manipulator's drive joints are then arm joints).
    notes.append(f"Arm joints ({len(names)}), base to tool: {', '.join(names)}.")
    own_servos = _has_servos(model, joints)
    if replace_servos or not own_servos:
        for act in list(spec.actuators):
            if act.target in names:
                spec.delete(act)
        for j, name, (kp, kv) in zip(joints, names, _servo_gains(model, joints), strict=True):
            act = spec.add_actuator(name=f"nimbotics_{name}", target=name, trntype=mujoco.mjtTrn.mjTRN_JOINT)
            act.set_to_position(kp=kp, kv=kv)
            if model.jnt_limited[j]:
                act.ctrlrange = list(model.jnt_range[j])
                act.ctrllimited = mujoco.mjtLimited.mjLIMITED_TRUE
        notes.append(f"Added {len(joints)} position servos ({SERVO_HZ:.0f} Hz, critically damped); "
                     + ("the model's own could not hold the arm still in simulation." if own_servos else "the model had none."))
    if held is not None:
        _add_home(spec, held)
    elif not any(k.name == "home" for k in spec.keys):
        spec.add_key(name="home", qpos=list(model.qpos0))
        notes.append("Home pose: the model's zero pose (no 'home' keyframe in the upload).")
    if not any(g.name == "floor" for g in spec.worldbody.geoms):
        _add_floor(spec)
        notes.append("Added a floor and lights.")
    spec.meshdir = _relative_dir(spec.meshdir, model_file.parent, dest)
    spec.texturedir = _relative_dir(spec.texturedir, model_file.parent, dest)
    (dest / SCENE_FILE).write_text(spec.to_xml())
    tool_name = model.body(tool).name
    mount = _mount(_compile(_load_spec(dest / SCENE_FILE)), tool_name)
    if mount is not None:
        notes.append(f"The arm is mounted on {mount[0]!r} at {mount[1][2]:.2f} m; tasks are placed in front of it.")
    return Normalized(ee_site=site, ee_body=tool_name, notes=tuple(notes), mount=mount[1] if mount else None)


MOUNT_AT_ORIGIN_M = 1e-3


def _mount(model: mujoco.MjModel, tool_name: str) -> tuple[str, tuple[float, float, float, float]] | None:
    """The body carrying the arm (parent of the first body with an arm joint) and its (x, y, z, yaw) at home.

    None when it is the world or sits at the origin facing +x, like every catalog arm: placement is unchanged then.
    """
    chain = _chain(model, model.body(tool_name).id)
    first = next(b for b in chain if _joint_count(model, b))
    carrier = int(model.body_parentid[first])
    if carrier == 0:
        return None
    data = mujoco.MjData(model)
    mujoco.mj_resetDataKeyframe(model, data, model.key("home").id)
    mujoco.mj_forward(model, data)
    x, y, z = (float(v) for v in data.xpos[carrier])
    rot = data.xmat[carrier].reshape(3, 3)
    yaw = float(np.arctan2(rot[1, 0], rot[0, 0]))
    if max(abs(x), abs(y), abs(z), abs(yaw)) < MOUNT_AT_ORIGIN_M:
        return None
    return model.body(carrier).name, (round(x, 4), round(y, 4), round(z, 4), round(yaw, 4))


def describe_model(model_file: Path, dest: Path) -> tuple[mujoco.MjModel, list[str]]:
    """Model-only uploads: write dest/SCENE_FILE (the model plus a floor and lights) and return the compiled model."""
    spec = _load_spec(model_file)
    _compile(spec)
    notes = ["Kept as a model only: it is stored and shown, but it cannot run tasks."]
    if not any(g.name == "floor" for g in spec.worldbody.geoms):
        _add_floor(spec)
        notes.append("Added a floor and lights for its picture.")
    spec.meshdir = _relative_dir(spec.meshdir, model_file.parent, dest)
    spec.texturedir = _relative_dir(spec.texturedir, model_file.parent, dest)
    (dest / SCENE_FILE).write_text(spec.to_xml())
    return _compile(_load_spec(dest / SCENE_FILE)), notes


def moving_joints(model: mujoco.MjModel) -> int:
    return sum(1 for j in range(model.njnt) if int(model.jnt_type[j]) in ARM_JOINT_TYPES)


def _load_spec(model_file: Path) -> mujoco.MjSpec:
    try:
        return mujoco.MjSpec.from_file(str(model_file))
    except Exception as exc:  # MuJoCo raises ValueError for any load problem; show it to the uploader
        raise UploadError(f"MuJoCo could not load the model: {exc}") from exc


def _compile(spec: mujoco.MjSpec) -> mujoco.MjModel:
    try:
        return spec.compile()
    except Exception as exc:  # noqa: BLE001 - any compile problem is the upload's
        raise UploadError(f"MuJoCo could not load the model: {exc}") from exc


def _relative_dir(value: str, model_dir: Path, dest: Path) -> str:
    base = (model_dir / value).resolve() if value else model_dir.resolve()
    try:
        return base.relative_to(dest.resolve()).as_posix() if base != dest.resolve() else ""
    except ValueError as exc:
        raise UploadError("Mesh folders must be inside the upload.") from exc


# ---------------------------------------------------------------- declared facts
def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")[:24] or "arm"


def make_decl(robot_id: str, name: str, folder: Path, norm: Normalized, uploaded_by: str | None) -> RobotDecl:
    return RobotDecl(
        robot_id=robot_id, display_name=f"{name} (uploaded)", short_name=name, model_dir=folder.name,
        scene_xml=SCENE_FILE, home_keyframe="home",
        end_effector=EndEffectorDecl(site_name=norm.ee_site, exists_in_model=True,
                                     note=" ".join(norm.notes)),
        tool_type="as uploaded", maker="Uploaded", source="upload", model_root=folder.parent,
        uploaded_by=uploaded_by, mount=norm.mount,
    )


def decl_to_json(decl: RobotDecl) -> str:
    d = asdict(decl)
    d["model_root"] = str(decl.model_root) if decl.model_root else None
    return json.dumps(d)


def decl_from_json(text: str) -> RobotDecl:
    d = json.loads(text)
    d["end_effector"] = EndEffectorDecl(**{**d["end_effector"], "offset_m": tuple(d["end_effector"]["offset_m"])})
    d["model_root"] = Path(d["model_root"]) if d["model_root"] else None
    d["mount"] = tuple(d["mount"]) if d.get("mount") else None
    d.pop("controller", None)
    return RobotDecl(**d)


def with_task_distance(decl: RobotDecl, max_reach_m: float) -> RobotDecl:
    """Task origin at about half the measured reach, like the catalog arms (0.25-0.70 m)."""
    return replace(decl, task_distance_m=round(float(np.clip(0.5 * max_reach_m, 0.25, 0.70)), 2))


def new_upload_folder(data: bytes, name: str, stored_models: int = 0) -> tuple[str, Path]:
    """Id and folder for a new upload; refuses a duplicate and a full Library (arms and model-only uploads)."""
    digest = hashlib.sha256(data).hexdigest()[:8]
    robot_id = f"up_{slug(name)}_{digest}"
    if robot_id in ROBOTS or (UPLOAD_DIR / robot_id).exists():
        raise UploadError("This exact model is already stored under this name.")
    if sum(1 for d in ROBOTS.values() if d.source == "upload") + stored_models >= MAX_UPLOADED_ROBOTS:
        raise UploadError(f"The Library already holds {MAX_UPLOADED_ROBOTS} uploaded robots.")
    return robot_id, UPLOAD_DIR / robot_id


def load_uploaded(decls_json: list[str]) -> list[str]:
    """Register stored uploads at startup; returns ids whose files are missing (skipped).

    Files missing from this machine's disk are fetched from the file store first (services/storage.py).
    """
    missing = []
    for text in decls_json:
        # The stored folder may be another machine's; uploads always live in this machine's UPLOAD_DIR.
        decl = replace(decl_from_json(text), model_root=UPLOAD_DIR)
        if not decl.scene_path.exists():
            _restore(decl.robot_id)
        if decl.scene_path.exists():
            register(decl)
        else:
            missing.append(decl.robot_id)
    return missing


def _restore(robot_id: str) -> None:
    try:
        count = storage.pull_upload(robot_id)
    except (storage.StoreError, ValueError):
        log.exception("Could not fetch uploaded robot %s from the file store", robot_id)
        return
    if count:
        log.info("Fetched uploaded robot %s from the file store (%d files)", robot_id, count)


__all__ = ["UploadError", "check_xml", "decl_from_json", "decl_to_json", "find_model", "flatten_meshes",
           "load_uploaded", "make_decl", "new_upload_folder", "normalize", "register", "unpack", "unregister",
           "with_task_distance", "HOLD_DRIFT_LIMIT_M", "MAX_UPLOAD_BYTES"]
