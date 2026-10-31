/** Text the model wrote; always labelled so it is never mistaken for a measured result. */
export function ModelText({ children }: { children: string }) {
  return (
    <p className="border-l-2 border-accent pl-3 text-xs text-ink-2">
      {children} <span className="font-mono text-[10px] text-ink-3">· model-written</span>
    </p>
  );
}
