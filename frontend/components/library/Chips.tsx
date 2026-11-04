/** A row of mutually exclusive chips for a short, fixed set of choices; it scrolls sideways rather than wrapping. */
export function Chips<T extends string>({ label, options, value, onPick }: {
  label: string; options: [T, string][]; value: T; onPick: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex max-w-full gap-1 overflow-x-auto [scrollbar-width:none]">
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onPick(v)}
          className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition-colors ${
            value === v ? "bg-ink text-bg" : "text-ink-2 hover:bg-panel-2 hover:text-ink"}`}>
          {text}
        </button>
      ))}
    </div>
  );
}
