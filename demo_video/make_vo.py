"""Generate the scratch voiceover (edge-tts). Lines already in vo/ are kept; delete a file to redo it.
Your own recordings: put vo/<id>.wav (or .m4a/.mp3) in place and they are used instead."""
import json, pathlib, subprocess, sys, time

TTS = sys.argv[1]
VOICE = "en-US-AndrewMultilingualNeural"
for line in json.load(open("narration.json")):
    out = pathlib.Path(f"vo/{line['id']}.mp3")
    if line["text"] == "RESULT_LINE" or any(pathlib.Path(f"vo/{line['id']}{e}").exists() for e in (".mp3", ".wav", ".m4a")):
        continue
    for attempt in range(4):
        r = subprocess.run([TTS, "--voice", VOICE, "--rate", "+8%", "--text", line["text"], "--write-media", str(out)],
                           capture_output=True, text=True)
        if r.returncode == 0 and out.stat().st_size > 1000:
            break
        print(line["id"], "retry", r.stderr[-200:]); time.sleep(2)
    else:
        sys.exit(f"TTS failed for {line['id']}")
