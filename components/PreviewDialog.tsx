import { backgrounds, type ShowcaseSettings } from '../lib/compositor/default-preset';
import { useEffect, useRef, useState } from 'react';

export type ResultState =
  | { phase: 'capturing' | 'composing' }
  | { phase: 'error'; error: string }
  | { phase: 'preview'; url: string; width: number; height: number; blob: Blob; settings: ShowcaseSettings; updating: boolean; updateError?: string };

export function PreviewDialog({ state, onSave, onAgain, onClose, onSettings }: {
  onSettings: (settings: ShowcaseSettings) => void;
  state: ResultState; onSave: () => void; onAgain: () => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  async function copyImage() {
    if (state.phase !== 'preview' || state.updating || state.updateError || copyStatus === 'copying') return;
    setCopyStatus('copying');
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': state.blob })]);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  }
  function changeSettings(settings: ShowcaseSettings) {
    setCopyStatus('idle');
    onSettings(settings);
  }
  useEffect(() => {
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, [state.phase]);
  const ready = state.phase === 'preview';
  const error = state.phase === 'error';
  return <div className="preview-shade">
    <div ref={dialog} className="preview-dialog" role="dialog" aria-modal="true" aria-labelledby="irida-title"
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const buttons = [...(dialog.current?.querySelectorAll<HTMLElement>('button:enabled, input:enabled, select:enabled') ?? [])];
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
      {ready && <fieldset className="preview-settings" disabled={copyStatus === 'copying'}>
        <legend>Appearance</legend>
        <label>Background<select value={state.settings.background} onChange={event => changeSettings({ ...state.settings, background: event.target.value as ShowcaseSettings['background'] })}>
          {backgrounds.map(background => <option key={background.value} value={background.value}>{background.label}</option>)}
        </select></label>
        {state.settings.background === 'solid' && <label>Color<input className="hex-color" type="text" aria-label="Hex color" defaultValue={state.settings.color} maxLength={7} spellCheck={false}
          onChange={event => { if (/^#[0-9a-f]{6}$/i.test(event.target.value)) changeSettings({ ...state.settings, color: event.target.value }); }}
          onBlur={event => { event.target.value = state.settings.color; }} /></label>}
        <label className="padding-control">Padding · {state.settings.padding} px<input type="range" min="0" max="160" step="8" value={state.settings.padding} onChange={event => changeSettings({ ...state.settings, padding: Number(event.target.value) })} /></label>
        <label className="shadow-control"><input type="checkbox" checked={state.settings.shadow} onChange={event => changeSettings({ ...state.settings, shadow: event.target.checked })} />Shadow</label>
      </fieldset>}
      {ready && <div role="status">{state.updating ? 'Updating image…' : state.updateError}</div>}
      <div className="preview-actions">
        {ready && <button className="primary" disabled={state.updating || Boolean(state.updateError)} onClick={onSave}>Save PNG <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2v8m-3-3 3 3 3-3M3 11v3h10v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}
        {ready && <button onClick={() => { void copyImage(); }} disabled={copyStatus === 'copying' || state.updating || Boolean(state.updateError)}>{copyStatus === 'copying' ? 'Copying…' : 'Copy image'}</button>}
        {(ready || error) && <button className={error ? 'primary' : ''} onClick={onAgain}>Grab again</button>}
        <button className="close-button" onClick={onClose}>Close</button>
      </div>
      {ready && <div role="status" aria-live="polite">
        {copyStatus === 'copied' && <p>Image copied.</p>}
        {copyStatus === 'error' && <p>Couldn’t copy the image. Try again or use Save PNG.</p>}
      </div>}
    </div>
  </div>;
}
