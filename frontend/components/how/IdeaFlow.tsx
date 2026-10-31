const IDEA = [
  { label: "Learn", text: "Robot A tries different ways to do a task in a simulator and finds one that works." },
  { label: "Remember", text: "It saves a skill card: what the task was and what worked." },
  { label: "Adapt", text: "Robot B, built differently, reads the card and plans its own motion." },
  { label: "Prove", text: "The new motion is tested in physics. Only a pass becomes a new skill." },
];

/** The whole system in four boxes. */
export function IdeaFlow() {
  return (
    <ol aria-label="The idea" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {IDEA.map((s, i) => (
        <li key={s.label} className="soft-card relative p-5">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xs text-accent">{i + 1}</span>
            <h3 className="text-base font-medium">{s.label}</h3>
          </div>
          <p className="mt-2 text-sm text-ink-2">{s.text}</p>
          {i < IDEA.length - 1 && (
            <span aria-hidden="true" className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 bg-bg px-0.5 text-accent lg:block">→</span>
          )}
        </li>
      ))}
    </ol>
  );
}
