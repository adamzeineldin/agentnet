# Voiceover script: one full take

**How to record**
- One take, lines in order, about a 1 second pause between lines. Your pauses stay in the video as you leave them.
- If you misspeak, pause and say that whole line again. I'll keep your last try.
- Speak at a relaxed but steady pace. The script is about 2:25 of speech.
- Quiet room, same distance from the mic throughout. Save it as `full_take.m4a` in Downloads.

**Pronunciation:** MuJoCo = "moo-JOE-co" · UR5e = "U-R-five-E" · Nimbotics = "nim-BOT-ics"

---

**v01 · Hook**
A robot learns a skill. But that skill stays locked inside its body. The next robot starts from zero.

**v02 · Problem**
And you can't just copy it over. A Panda has seven joints. A UR5e has six. Same task, totally different motion.

**v03 · Solution**
Nimbotics is a shared memory for robots. One robot learns a task in simulation. It saves the task and the route that worked, but not its joint angles. A different robot then works out its own motion. And physics decides what gets saved.

**v04 · Lab: describe**
Here's the Lab. I pick the UR5e and describe the job in plain words.

**v05a · Lab: Muse matches**
Meta's Muse Spark reads my request and the whole library in one call, and finds the matching task. Reach between two posts.

**v05b · Lab: Muse asks**
If it isn't sure, it shows me the closest match and asks a question.

**v06 · Lab: librarian**
The UR5e has never done this task. But the Capsule arm, a robot someone uploaded, has. So the UR5e learns from it, and Muse decides which routes to try first.

**v07 · Lab: run**
Muse can look at both robots and at why each route failed, but it can only read. It never moves the robot. The UR5e solves its own motion, and the MuJoCo simulator tests the top three routes.

**v08 · Lab: result**
Less than a millimetre off target, and it touched nothing. Only then is the skill saved, linked back to the Capsule arm.

**v09 · Lab: audit**
Every Muse call is logged. This run used two calls, for less than a tenth of a cent. And this time, Muse picked the same route our basic rule would have.

**v09b · Muse designs a task**
Muse can also design a brand new task from one sentence. Our backend checks the layout before anything runs.

**v09c · Physics says no**
But Muse can't make a task possible. Here, no route passed the physics test, so nothing was saved.

**v10 · Muse thinks, physics proves**
So Muse thinks. It matches goals, designs tasks, ranks routes, and sums up the library. Physics proves. Nothing becomes a skill until the simulator checks it.

**v11 · Evidence**
We tested this on twenty new scenes. Sharing matched planning from scratch, seventeen out of twenty, while plain retargeting solved ten. It cut the search on eleven scenes, and made it worse on six.

**v12 · Library**
It's live at nimbotics dot net. Anyone can upload a robot arm, even one on a humanoid, and see which robot taught which.

**v13 · Close**
One robot learns it. Every robot remembers. This is Nimbotics.

---

*Where the facts come from:*
- **v08:** the run ended 0.7 mm from the target with zero contacts.
- **v09:** 2 calls cost $0.00066, and the offline rule would have made the same pick.
- **v11:** from `docs/EVALUATION_RESULTS.md`. The 20 held-out scenes are the "new scenes".
