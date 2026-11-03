"""Robot uploads: a user's MJCF or URDF (or a zip with its meshes) becomes a fleet arm.

Pipeline (worker thread for everything that touches MuJoCo):
  1. unpack: size, file-count and extension limits; zip paths must stay inside the upload folder.
  2. check_xml: no DOCTYPE/entities, no plugins, every file reference relative and inside the folder.
  3. normalize: find the arm chain and its tool body, add what Nimbotics needs and record each addition:
     a tool site, one position servo per arm joint (only if the model has none), a "home" keyframe, a floor.
  4. verify: the RobotAdapter must accept it and the arm must hold its home pose in physics; then the
     passport is computed from the model like any catalog arm.
Nothing about the robot is assumed beyond what the upload declares (its name) and what is read from the model.
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import shutil
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import asdict, dataclass, replace
from pathlib import Path, PurePosixPath

import mujoco
import numpy as np

from app.config import UPLOAD_DIR
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


class UploadError(ValueError):
    """Shown to the user as is: says what is wrong with the upload and how to fix it."""


@dataclass(frozen=True)
class Normalized:
    ee_site: str
    ee_body: str
    notes: tuple[str, ...]


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


def find_tool_body(model: mujoco.MjModel) -> int:
    """Follow the arm from its base into the child holding the most joints; stop at a fork (a gripper's fingers)."""
    roots = [b for b in range(1, model.nbody) if model.body_parentid[b] == 0]
    sub = _subtree_joints(model)
    body = max(roots, key=lambda b: sub[b])
    while True:
        moving = [c for c in range(1, model.nbody) if model.body_parentid[c] == body and sub[c] > 0]
        if len(moving) != 1:
            return body
        body = moving[0]


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
    tool = find_tool_body(model)
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
    try:
        spec = mujoco.MjSpec.from_file(str(model_file))
        model = spec.compile()
    except Exception as exc:  # MuJoCo raises ValueError for any compile problem; show it to the uploader
        raise UploadError(f"MuJoCo could not load the model: {exc}") from exc
    if any(int(model.jnt_type[j]) == int(mujoco.mjtJoint.mjJNT_FREE) for j in range(model.njnt)):
        raise UploadError("The robot has a free-floating base. Upload a fixed-base arm (no freejoint).")
    tool, site = _resolve_tool(model, tool_hint)
    joints = _arm_joints(model, tool)
    if not MIN_DOF <= len(joints) <= MAX_DOF:
        raise UploadError(f"The arm from its base to {model.body(tool).name!r} has {len(joints)} joints; "
                          f"Nimbotics needs {MIN_DOF} to {MAX_DOF}.")
    notes = [f"Tool point: {'site ' + repr(site) if site else 'added at the origin of ' + repr(model.body(tool).name)}."]
    if site is None:
        spec.body(model.body(tool).name).add_site(name=TCP_SITE, size=[0.008, 0, 0], rgba=[0.1, 0.9, 1.0, 0.9], group=2)
        site = TCP_SITE
    names = [model.joint(j).name for j in joints]
    if any(not n for n in names):
        raise UploadError("Every arm joint needs a name in the model.")
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
    if not any(k.name == "home" for k in spec.keys):
        spec.add_key(name="home", qpos=list(model.qpos0))
        notes.append("Home pose: the model's zero pose (no 'home' keyframe in the upload).")
    if not any(g.name == "floor" for g in spec.worldbody.geoms):
        _add_floor(spec)
        notes.append("Added a floor and lights.")
    spec.meshdir = _relative_dir(spec.meshdir, model_file.parent, dest)
    spec.texturedir = _relative_dir(spec.texturedir, model_file.parent, dest)
    (dest / SCENE_FILE).write_text(spec.to_xml())
    return Normalized(ee_site=site, ee_body=model.body(tool).name, notes=tuple(notes))


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
        uploaded_by=uploaded_by,
    )


def decl_to_json(decl: RobotDecl) -> str:
    d = asdict(decl)
    d["model_root"] = str(decl.model_root) if decl.model_root else None
    return json.dumps(d)


def decl_from_json(text: str) -> RobotDecl:
    d = json.loads(text)
    d["end_effector"] = EndEffectorDecl(**{**d["end_effector"], "offset_m": tuple(d["end_effector"]["offset_m"])})
    d["model_root"] = Path(d["model_root"]) if d["model_root"] else None
    d.pop("controller", None)
    return RobotDecl(**d)


def with_task_distance(decl: RobotDecl, max_reach_m: float) -> RobotDecl:
    """Task origin at about half the measured reach, like the catalog arms (0.25-0.70 m)."""
    return replace(decl, task_distance_m=round(float(np.clip(0.5 * max_reach_m, 0.25, 0.70)), 2))


def new_upload_folder(data: bytes, name: str) -> tuple[str, Path]:
    digest = hashlib.sha256(data).hexdigest()[:8]
    robot_id = f"up_{slug(name)}_{digest}"
    if robot_id in ROBOTS:
        raise UploadError("This exact model is already in the fleet.")
    if sum(1 for d in ROBOTS.values() if d.source == "upload") >= MAX_UPLOADED_ROBOTS:
        raise UploadError(f"The fleet already holds {MAX_UPLOADED_ROBOTS} uploaded robots.")
    return robot_id, UPLOAD_DIR / robot_id


def load_uploaded(decls_json: list[str]) -> list[str]:
    """Register stored uploads at startup; returns ids whose files are missing (skipped)."""
    missing = []
    for text in decls_json:
        decl = decl_from_json(text)
        if decl.scene_path.exists():
            register(decl)
        else:
            missing.append(decl.robot_id)
    return missing


__all__ = ["UploadError", "check_xml", "decl_from_json", "decl_to_json", "find_model", "flatten_meshes",
           "load_uploaded", "make_decl", "new_upload_folder", "normalize", "register", "unpack", "unregister",
           "with_task_distance", "HOLD_DRIFT_LIMIT_M", "MAX_UPLOAD_BYTES"]
