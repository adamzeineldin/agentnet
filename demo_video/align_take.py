"""Matches a full voice take to the script and saves the edit plan that build.py follows.

Usage: python3 align_take.py <take>      (run transcribe_take.py on the same take first)
Writes build/take_plan.json. While that file exists, build.py uses your take as one continuous voice track;
delete it to go back to the separate line files in vo/.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from split_take import duration
from take_edit import align

ROOT = Path(__file__).parent


def main() -> None:
    take = Path(sys.argv[1]).resolve()
    lines = json.loads((ROOT / "narration.json").read_text())
    words = json.loads((ROOT / "build/take_words.json").read_text())
    plan = align(lines, words)
    print(f"{'id':<6}{'start':>8}{'end':>8}  heard")
    for p in plan:
        note = f"   [cut a false start {p['skip'][0]:.2f}-{p['skip'][1]:.2f}s]" if p["skip"] else ""
        print(f"{p['id']:<6}{p['s']:8.2f}{p['e']:8.2f}  {p['heard']}{note}")
    out = {"take": str(take), "take_len": duration(take), "lines": plan, "words": words}
    (ROOT / "build/take_plan.json").write_text(json.dumps(out, indent=0))
    print("wrote build/take_plan.json; run python3 build.py")


if __name__ == "__main__":
    main()
