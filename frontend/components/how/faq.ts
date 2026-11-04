/** Common questions under the How it works story. Facts mirror the backend (route search, pass checks, catalog). */

export interface Faq { q: string; a: string }

export const FAQ: Faq[] = [
  {
    q: "What does Nimbotics do?",
    a: "One robot arm learns a task in simulation. We save what worked as a skill, so a different arm can reuse it.",
  },
  {
    q: "Why not just copy the joint angles?",
    a: "Every arm has different joints and reach. So we save the task itself, and each arm works out its own motion.",
  },
  {
    q: "Who decides if it worked?",
    a: "The physics simulator. The hand must stop within 1 cm of the target, touch nothing, and stay inside its joint limits.",
  },
  {
    q: "Where does AI fit in?",
    a: "An AI model can suggest which route to try first and explain the result. It never moves the robot or decides a pass.",
  },
  {
    q: "Has this run on a real robot?",
    a: "Not yet. Results here are simulation-verified. We also replay real recorded robot motions and can check UR5e moves on Universal Robots' controller software.",
  },
  {
    q: "Which robots can I use?",
    a: "Ten arms are built in, including the Franka Panda and UR5e. You can also upload your own.",
  },
  {
    q: "What happens when a run fails?",
    a: "It's kept and shown with the reason. Only passing runs become skills.",
  },
];
