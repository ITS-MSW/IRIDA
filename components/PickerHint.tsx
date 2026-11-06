export function PickerHint({ issue }: { issue?: string }) {
  return <div className="picker-hint" role="status" data-invalid={Boolean(issue)}>
    <span className="hint-dot" aria-hidden="true" />
    <span>{issue ?? 'Click to grab'}</span><span aria-hidden="true">·</span>
    <span className="picker-keys">↑ parent · ↓ child · Esc cancel</span>
  </div>;
}
