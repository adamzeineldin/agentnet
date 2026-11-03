/** Plain-language meanings of the words used around the site. One source for the How it works glossary and <Term> hints. */

export const GLOSSARY = {
  seed: { term: "Layout number", meaning: "Each task type can be built in many layouts: obstacle sizes and where the start " +
    "and target are. A layout number picks one, and the same number always builds the same layout, so anyone can repeat a run. " +
    "Like a level number in a game. You never need to pick one: a new random layout is used unless you choose." },
  scene: { term: "Scene", meaning: "One task layout: the floor, the obstacles (a wall, a fence, a shelf, posts…) and the start and target points." },
  route: { term: "Route", meaning: "One way to the target: straight, over the top, or around the near or far side. Also called a candidate." },
  skill: { term: "Skill / Experience Capsule", meaning: "The saved card: the task, the route that worked, and the evidence." },
  transfer: { term: "Transfer (retarget)", meaning: "Giving a skill learned by one robot to a robot with a different body." },
  imagination: { term: "Imagination", meaning: "Quick simulated previews of a few routes before choosing one to run for real in the simulator." },
  routeRanking: { term: "Route ranking", meaning: "How the robot picks which route to try first. The offline planner uses " +
    "built-in rules; Meta Muse Spark is an AI model that can do it when a key is set. Either way, the simulator decides pass or fail." },
  ik: { term: "IK (inverse kinematics)", meaning: "Working out the joint angles that put the robot's hand at a given point." },
  endpointError: { term: "Endpoint error", meaning: "How far the hand ended from the target. Under 1 cm (10 mm) passes." },
  pathDeviation: { term: "Path deviation", meaning: "The furthest the simulated hand got from the real recorded path. " +
    "Under 1 cm (10 mm) at every point passes." },
  mujoco: { term: "MuJoCo", meaning: "A physics simulator. It runs the robot's motors, gravity and contacts." },
  ursim: { term: "URSim", meaning: "The controller software that runs real UR robots, running here without an arm attached." },
  droid: { term: "DROID", meaning: "A public dataset of motions recorded on real Panda arms. We imported 8 of them." },
  simVerified: { term: "Simulation-verified", meaning: "Passed every check in the simulator. Not the same as tested on a physical robot." },
  offlinePlanner: { term: "Offline planner", meaning: "Built-in rules that rank routes without calling any AI model. The default." },
  passport: { term: "Robot passport", meaning: "A robot's facts (joints, limits, reach), read from its model, each tagged with where it came from." },
  adaptation: { term: "Adaptation (lineage)", meaning: "A skill adapted from another one. It records its parent, so you can trace where it came from." },
  benchmark: { term: "Benchmark", meaning: "The same test on 20 layouts the robots never saw, comparing with and without shared experience." },
} as const;

export type TermId = keyof typeof GLOSSARY;
