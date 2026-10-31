import { apiUrl } from "@/lib/api";
import type { RunRecord } from "@/lib/types";

interface RunVideoProps { run: RunRecord | null; busy: boolean; emptyLabel: string; rate?: number }

/** Recorded MuJoCo clip. `rate` slows playback for presentation and is always labelled on screen. */
export function RunVideo({ run, busy, emptyLabel, rate = 1 }: RunVideoProps) {
  if (run?.artifacts.video) {
    return (
      <div className="relative">
        <video key={run.artifacts.video} src={apiUrl(run.artifacts.video)}
          poster={run.artifacts.poster ? apiUrl(run.artifacts.poster) : undefined}
          onLoadedMetadata={(e) => { e.currentTarget.playbackRate = rate; }}
          controls autoPlay muted playsInline loop className="aspect-video w-full rounded-xl border border-line bg-black" />
        {rate !== 1 && (
          <span className="absolute top-2 right-2 bg-black/70 px-2 py-0.5 font-mono text-[11px] text-white/80">
            {rate}× speed · simulated time
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-line px-4 text-center text-xs text-ink-3">
      {busy ? "Searching and simulating in MuJoCo…" : run ? "No execution video (run did not reach execution)" : emptyLabel}
    </div>
  );
}
