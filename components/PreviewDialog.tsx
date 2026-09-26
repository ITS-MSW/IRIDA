import { useEffect, useRef } from 'react';

export type ResultState =
  | { phase: 'capturing' | 'composing' }
  | { phase: 'error'; error: string }
  | { phase: 'preview'; url: string; width: number; height: number; blob: Blob };

export function PreviewDialog({ state, onSave, onAgain, onClose }: {
  state: ResultState; onSave: () => void; onAgain: () => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, [state.phase]);
  const ready = state.phase === 'preview';
  const error = state.phase === 'error';
  return <div className="preview-shade">
    <div ref={dialog} className="preview-dialog" role="dialog" aria-modal="true" aria-labelledby="irida-title"
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
        const first = buttons[0];
        const last = buttons.at(-1);
        const active = dialog.current?.getRootNode() as ShadowRoot;
        if (event.shiftKey && active.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && active.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className="preview-header"><h2 id="irida-title">{ready ? 'Your showcase is ready' : error ? 'Couldn’t grab this element' : 'Creating your showcase…'}</h2>
        {ready && <span className="dimensions">{state.width} × {state.height} px</span>}
      </div>
      {ready ? <div className="preview-image"><img src={state.url} width={state.width} height={state.height} alt="Generated showcase PNG" /></div>
        : error ? <p className="error-message" role="alert">{state.error}</p>
        : <div className="loading" role="status"><span className="spinner" aria-hidden="true" />{state.phase === 'capturing' ? 'Capturing your selection…' : 'Finishing your image…'}</div>}
      <div className="preview-actions">
        {ready && <button className="primary" onClick={onSave}>Save PNG <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2v8m-3-3 3 3 3-3M3 11v3h10v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}
        {(ready || error) && <button className={error ? 'primary' : ''} onClick={onAgain}>Grab again</button>}
        <button className="close-button" onClick={onClose}>Close</button>
      </div>
    </div>
  </div>;
}
