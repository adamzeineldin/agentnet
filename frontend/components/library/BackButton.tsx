export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="text-sm text-ink-3 hover:text-ink">← {label}</button>;
}
