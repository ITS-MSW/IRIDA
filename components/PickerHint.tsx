export function PickerHint() {
  return <div className="picker-hint" role="status">
    <span className="hint-dot" aria-hidden="true" />
    Click to grab <span aria-hidden="true">·</span> ↑ parent <span aria-hidden="true">·</span> ↓ child <span aria-hidden="true">·</span> Esc cancel
  </div>;
}
