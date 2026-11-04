# Demo video (Meta hackathon)

`out/nimbotics_demo.mp4`: under 3:00, 1920×1080, 30 fps, -16 LUFS. Captions are in `out/nimbotics_demo.srt` (upload them
with the video). Every app shot is a real run on the local stack (`make dev` with `MODEL_API_KEY`), recorded on
2026-11-04:

- **Muse match**: a real scout answer for "Slide a part through a narrow gap between two posts" → Reach between two posts.
- **Muse question**: a fresh call for "Get the part past the obstacle to the other side" → closest match plus the
  question "What is in the way - a low wall, tall wall, fence, or something else?".
- **Adapt run**: Capsule arm → UR5e with Muse Spark ordering the routes (2 calls, 5195/721 tokens, $0.00066; the
  model did not change the pick, and the video says so). It was verified at 0.7 mm with 0 contacts.
- **Muse design**: "Reach into tray under lamp", designed by Muse from that sentence (a 26 s call, trimmed). Then the
  UR5e failed it: no route reached physics, so nothing was saved. The Panda failed it too (`build/clips/designer.mp4`).
- **Evaluation card**: numbers from `docs/EVALUATION_RESULTS.md` (offline planner, 20 held-out scenes).

The voice is your own continuous take (`vo/full_take2.m4a`). Slides, the How it works story and the Library are timed to its words.

## Recording your own voice

The script and recording tips are in [SCRIPT.md](SCRIPT.md). Record one full take with about a 2-second pause between
lines, then run:

```bash
<venv with faster-whisper>/bin/python transcribe_take.py vo/full_take.m4a   # word timestamps -> build/take_words.json
python3 align_take.py vo/full_take.m4a   # matches your words to the 16 lines, drops false starts -> build/take_plan.json
python3 build.py                         # your take is one continuous voice track; the shots follow its pace
node record_timed.mjs                    # re-records slides, the story and the Library on your words
python3 build.py                         # final cut, with every timed shot in step
```

While `build/take_plan.json` exists the build uses your take. Delete that file to go back to separate line files in `vo/`.
`split_take.py` is the simpler fallback: it cuts at the 15 longest pauses and needs about 2 s between lines.

## Rebuilding from scratch

```bash
node record_app.mjs home present lab library               # app clips (needs the local stack + MODEL_API_KEY)
DESIGN_GOAL="..." node record_app.mjs designer             # Muse task designer
Q_GOAL="..." node record_app.mjs question                  # Muse asks a question
node record_cards.mjs                                      # title cards + labels
python3 make_vo.py <path to edge-tts>                      # placeholder voice (skips ids you recorded)
python3 build.py                                           # -> out/nimbotics_demo.mp4 + .srt
```

The Lab clips each sign up a new local test account (`demo-…@example.test`), so the runs they make are private to
those accounts. Shot timing, labels and holds are all set in `TIMELINE` in `build.py`.
