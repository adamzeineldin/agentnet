import type { EvidenceKind } from "../ui";

/** Plain-language copy for the How it works page. Facts here mirror the backend (route_planner, task_scene, config). */

export interface Step {
  title: string;
  what: string;
  see: string;
  detail: string;
  evidence: EvidenceKind[];
  href: string;
  cta: string;
}

export const STEPS: Step[] = [
  {
    title: "The Panda learns the task",
    what: "Robot A, a Franka Panda arm, tries 10 possible routes in the simulator: straight through, over the wall, " +
      "and around either side, each at a few distances from the wall. It keeps the first route that passes the test.",
    see: "Press Discover Skill in Transfer Lab. You get a video of the run and a card for every route, with why the " +
      "failed ones failed.",
    detail: "Each route is turned into joint angles with inverse kinematics (IK), screened for collisions, then " +
      "executed in MuJoCo physics through the robot's own motors.",
    evidence: ["sim"], href: "/transfer", cta: "Open Transfer Lab",
  },
  {
    title: "It saves a skill card",
    what: "Publishing stores what was learned: where the start, target and wall were, which route worked, and the " +
      "measurements that prove it. It does not store the Panda's joint angles, because those only fit the Panda's body.",
    see: "Press Publish Experience. The card appears on the Skills page with its evidence.",
    detail: "The card (an \"Experience Capsule\") stores the task in a robot-neutral task frame: origin on the floor " +
      "in front of the robot, x away from it, z up, in metres.",
    evidence: ["sim"], href: "/skills", cta: "Open Skills",
  },
  {
    title: "A different robot adapts it",
    what: "Robot B, a UR5e arm with different joints and reach, places the same task in front of itself and works " +
      "out its own joint motion. It tries the route the Panda found first, then the others.",
    see: "Press Transfer Skill. Before moving, it previews the most promising routes in simulation " +
      "(\"imagination\") and shows which ones it predicts will work.",
    detail: "Route order comes from the Panda's experience: the offline planner by default, or Meta Muse Spark when " +
      "a key is configured. The model only ranks and explains; the simulator decides pass or fail.",
    evidence: ["sim", "model"], href: "/transfer", cta: "Open Transfer Lab",
  },
  {
    title: "Physics decides pass or fail",
    what: "The chosen motion runs in the simulator. It passes only if the hand ends within 1 cm of the target, " +
      "nothing touches the wall, no joint goes past its limit, and the arm comes to rest.",
    see: "A green or red result with the reason. Every run is kept in the run log, failures included.",
    detail: "A passing transfer can be published as a new skill that records which skill it was adapted from, so " +
      "you can follow a skill's family tree on the Skills page.",
    evidence: ["sim"], href: "/history", cta: "Open the run log",
  },
  {
    title: "Optional: check on the robot's controller software",
    what: "The UR5e's motion can also be sent to URSim, the official controller software from Universal Robots. " +
      "It reports where it actually moved the arm, which we compare with the simulator.",
    see: "Tick \"also run on the URSim controller\" before transferring. This is controller software, not a physical arm.",
    detail: "Joint targets are streamed at 125 Hz through ur_rtde. The check passes when the controller reaches the " +
      "final joints and its tool position agrees with the simulator within 5 mm.",
    evidence: ["controller"], href: "/transfer", cta: "Open Transfer Lab",
  },
];

export const EVIDENCE: { kind: EvidenceKind; plain: string }[] = [
  { kind: "real", plain: "Recorded on a real, physical Panda arm by researchers (the public DROID dataset). We only replay it." },
  { kind: "sim", plain: "Measured by Nimbotics in the MuJoCo physics simulator. Most numbers on the site are this." },
  { kind: "controller", plain: "Reported by Universal Robots' controller software after we sent it the motion. No physical arm." },
  { kind: "model", plain: "Text or rankings written by an AI model. Never a measurement." },
];
