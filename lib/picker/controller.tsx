import { createRoot, type Root } from 'react-dom/client';
import { createShadowRootUi, type ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { PickerHint } from '../../components/PickerHint';
import { PreviewDialog, type ResultState } from '../../components/PreviewDialog';
import { captureSubject, savePng } from '../capture/client';
import { sameBounds } from '../capture/geometry';
import { inspectTarget, validateSnapshot, type TargetSnapshot } from '../capture/target';
import { renderShowcase } from '../compositor/render-showcase';
import { matchesRequest, type RequestId, type CaptureMessage } from '../messaging';
import { composedParent, elementAtPoint, elementBounds, freshBounds, isUseful } from './react-grab-adapter';

type State = { phase: 'idle' } | { phase: 'picking' } | ResultState;
interface CaptureJob extends RequestId {
  target: Element;
  snapshot: TargetSnapshot;
  abort: AbortController;
  failure?: Error;
  frame: number;
}

function afterPaint(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let frame = 0;
    const cancel = () => { cancelAnimationFrame(frame); reject(new DOMException('Cancelled', 'AbortError')); };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) { cancel(); return; }
    // The first callback runs before paint; the second runs after the hidden frame.
    frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }); });
  });
}

export class PickerController {
  private state: State = { phase: 'idle' };
  private sessionId = '';
  private ui?: ShadowRootContentScriptUi<Root>;
  private uiPromise?: Promise<ShadowRootContentScriptUi<Root>>;
  private root?: Root;
  private outline?: HTMLDivElement;
  private label?: HTMLDivElement;
  private target: Element | null = null;
  private parents: Element[] = [];
  private pointer?: { x: number; y: number };
  private hoverOrigin?: { x: number; y: number };
  private frame = 0;
  private lastOutline = '';
  private activeEvents?: AbortController;
  private pickingEvents?: AbortController;
  private job?: CaptureJob;
  private previousFocus: Element | null = null;

  constructor(private ctx: ContentScriptContext, private css: string) {}

  async toggle() {
    if (this.state.phase !== 'idle') this.close();
    else await this.startPicking();
  }

  close(restoreFocus = true) {
    this.sessionId = '';
    this.stopCapture();
    this.stopPicking();
    this.activeEvents?.abort();
    if (this.state.phase === 'preview') URL.revokeObjectURL(this.state.url);
    this.state = { phase: 'idle' };
    this.ui?.remove();
    this.target = null;
    this.parents = [];
    this.pointer = this.hoverOrigin = undefined;
    if (restoreFocus && this.previousFocus instanceof HTMLElement && this.previousFocus.isConnected) {
      this.previousFocus.focus({ preventScroll: true });
    }
    if (restoreFocus) this.previousFocus = null;
  }

  private async prepareUi() {
    this.uiPromise ??= createShadowRootUi(this.ctx, {
      name: 'irida-showcase', position: 'inline', inheritStyles: true, css: this.css,
      isolateEvents: ['click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'keydown', 'keyup', 'keypress'],
      anchor: () => document.querySelector('dialog:modal') ?? document.body,
      onMount: (container, _shadow, host) => {
        host.setAttribute('data-react-grab-ignore', '');
        host.setAttribute('popover', 'manual');
        host.style.cssText = 'all: initial !important; position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; margin: 0 !important; padding: 0 !important; border: 0 !important; background: transparent !important; overflow: visible !important; pointer-events: none !important; z-index: 2147483647 !important;';
        this.outline = document.createElement('div');
        this.outline.className = 'picker-outline';
        this.lastOutline = '';
        this.outline.hidden = true;
        this.label = document.createElement('div');
        this.label.className = 'picker-label';
        this.label.hidden = true;
        const app = document.createElement('div');
        app.className = 'irida-root';
        container.append(this.outline, this.label, app);
        this.root = createRoot(app);
        return this.root;
      },
      onRemove: root => { root?.unmount(); this.root = undefined; this.outline = this.label = undefined; },
    });
    this.ui = await this.uiPromise;
    return this.ui;
  }

  private show() {
    if (!this.ui) return;
    if (!this.ui.shadowHost.isConnected) this.ui.mount();
    this.ui.shadowHost.style.setProperty('visibility', 'visible', 'important');
    if (!this.ui.shadowHost.matches(':popover-open')) this.ui.shadowHost.showPopover();
    this.render();
  }

  private render() {
    if (this.state.phase === 'idle') return;
    if (this.state.phase === 'picking') this.root?.render(<PickerHint />);
    else this.root?.render(<PreviewDialog state={this.state} onClose={() => this.close()}
      onAgain={() => { void this.startPicking().catch(error => this.showError(error)); }}
      onSave={() => { if (this.state.phase === 'preview' && this.ui) savePng(this.state.blob, this.ui.uiContainer); }} />);
  }

  private async startPicking() {
    this.previousFocus ??= document.activeElement;
    this.close(false);
    const sessionId = this.sessionId = crypto.randomUUID();
    this.state = { phase: 'picking' };
    try {
      await this.prepareUi();
      if (this.sessionId !== sessionId || this.ctx.isInvalid) { this.close(); return; }
      this.show();
      this.installHandlers();
      this.tick();
    } catch (error) { this.close(); throw error; }
  }

  private isOwnEvent(event: Event) { return this.ui !== undefined && event.composedPath().includes(this.ui.shadowHost); }
  private suppress(event: Event) { if (event.cancelable) event.preventDefault(); event.stopImmediatePropagation(); }

  private installHandlers() {
    this.activeEvents = new AbortController();
    const activeSignal = this.activeEvents.signal;
    window.addEventListener('pagehide', () => this.close(), { signal: activeSignal });
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') { this.suppress(event); this.close(); return; }
      if (this.isOwnEvent(event)) return;
      if (this.state.phase !== 'picking' && this.state.phase !== 'capturing') return;
      if (['ArrowUp', 'ArrowDown', 'Enter', ' '].includes(event.key)) this.suppress(event);
      if (this.state.phase !== 'picking' || !this.target || !this.ui) return;
      if (event.key === 'ArrowUp') {
        let parent = composedParent(this.target);
        while (parent) {
          if (isUseful(parent, this.ui.shadowHost) && !sameBounds(freshBounds(parent), freshBounds(this.target))) {
            this.parents.push(this.target); this.target = parent; break;
          }
          parent = composedParent(parent);
        }
      } else if (event.key === 'ArrowDown') {
        const child = this.parents.pop();
        if (child && isUseful(child, this.ui.shadowHost)) this.target = child;
      }
    }, { capture: true, signal: activeSignal });

    this.pickingEvents = new AbortController();
    const signal = this.pickingEvents.signal;
    window.addEventListener('pointermove', event => {
      if (this.isOwnEvent(event) || this.state.phase !== 'picking') return;
      event.stopImmediatePropagation();
      this.pointer = { x: event.clientX, y: event.clientY };
    }, { capture: true, passive: true, signal });
    for (const name of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'auxclick', 'dblclick', 'contextmenu', 'dragstart']) {
      window.addEventListener(name, event => {
        if (this.isOwnEvent(event)) return;
        this.suppress(event);
        if (name === 'click' && event instanceof MouseEvent && event.button === 0 && this.state.phase === 'picking' && this.target) {
          void this.confirm(this.target);
        }
      }, { capture: true, signal });
    }
  }

  private tick = () => {
    if (this.state.phase !== 'picking' || !this.ui) return;
    if (this.pointer && (!this.hoverOrigin || Math.hypot(this.pointer.x - this.hoverOrigin.x, this.pointer.y - this.hoverOrigin.y) >= 4)) {
      this.hoverOrigin = this.pointer;
      this.target = elementAtPoint(this.pointer.x, this.pointer.y, this.ui.shadowHost);
      this.parents = [];
    }
    if (this.target && !isUseful(this.target, this.ui.shadowHost)) this.target = null;
    const bounds = this.target && elementBounds(this.target);
    if (this.outline && this.label) {
      this.outline.hidden = this.label.hidden = !bounds;
      if (bounds && this.target) {
        const style = `left:${bounds.x}px;top:${bounds.y}px;width:${bounds.width}px;height:${bounds.height}px;border-radius:${bounds.borderRadius}`;
        if (this.lastOutline !== style) { this.outline.style.cssText = style; this.lastOutline = style; }
        this.label.style.left = `${Math.max(8, Math.min(bounds.x, innerWidth - 190))}px`;
        this.label.style.top = `${bounds.y >= 35 ? bounds.y - 30 : Math.min(innerHeight - 32, bounds.y + bounds.height + 7)}px`;
        const text = `${this.target.tagName.toLowerCase()} · ${Math.round(bounds.width)} × ${Math.round(bounds.height)}`;
        if (this.label.textContent !== text) this.label.textContent = text;
      }
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  private stopPicking() { cancelAnimationFrame(this.frame); this.pickingEvents?.abort(); }
  private stopCapture() {
    if (this.job) { this.job.abort.abort(); cancelAnimationFrame(this.job.frame); this.job = undefined; }
  }

  private validateJob(job: CaptureJob) {
    if (this.job !== job || this.sessionId !== job.sessionId) throw new DOMException('Cancelled', 'AbortError');
    if (job.failure) throw job.failure;
    job.abort.signal.throwIfAborted();
    validateSnapshot(job.target, job.snapshot);
    if (!this.ui?.shadowHost.isConnected) throw new Error('The page changed during capture. Try again.');
  }

  verify(request: RequestId): boolean {
    if (!this.job || !matchesRequest(this.job, request) || this.state.phase !== 'capturing') return false;
    try { this.validateJob(this.job); return true; }
    catch { return false; }
  }

  private watchCapture(job: CaptureJob) {
    const fail = () => {
      job.failure = new Error('The page moved or changed during capture. Hold it still and try again.');
      job.abort.abort();
    };
    const signal = job.abort.signal;
    for (const event of ['scroll', 'resize', 'popstate', 'hashchange']) window.addEventListener(event, fail, { capture: true, passive: true, signal });
    document.addEventListener('visibilitychange', fail, { signal });
    window.visualViewport?.addEventListener('resize', fail, { signal });
    window.visualViewport?.addEventListener('scroll', fail, { signal });
    const check = () => {
      try { this.validateJob(job); job.frame = requestAnimationFrame(check); }
      catch (error) { job.failure = error instanceof Error ? error : new Error('The selection changed.'); job.abort.abort(); }
    };
    job.frame = requestAnimationFrame(check);
  }

  private async confirm(target: Element) {
    if (this.state.phase !== 'picking' || !this.ui) return;
    const sessionId = this.sessionId;
    let subject: Awaited<ReturnType<typeof captureSubject>> | undefined;
    try {
      const snapshot = inspectTarget(target);
      const job: CaptureJob = { sessionId, requestId: crypto.randomUUID(), target, snapshot, abort: new AbortController(), frame: 0 };
      this.job = job;
      this.state = { phase: 'capturing' };
      cancelAnimationFrame(this.frame);
      this.ui.shadowHost.style.setProperty('visibility', 'hidden', 'important');
      this.watchCapture(job);
      await afterPaint(job.abort.signal);
      this.validateJob(job);
      const message: CaptureMessage = { type: 'irida:capture', sessionId, requestId: job.requestId, rect: snapshot.rect, viewport: snapshot.viewport };
      subject = await captureSubject(message, snapshot, job.abort.signal, () => this.validateJob(job));
      this.validateJob(job);
      this.stopCapture();
      this.stopPicking();
      this.state = { phase: 'composing' };
      if (this.outline) this.outline.hidden = true;
      if (this.label) this.label.hidden = true;
      this.show();
      const result = await renderShowcase(subject.canvas, subject.scaleX, subject.scaleY);
      if (this.sessionId !== sessionId) return;
      this.state = { phase: 'preview', ...result, url: URL.createObjectURL(result.blob) };
      this.render();
    } catch (error) {
      if (this.sessionId !== sessionId) return;
      this.showError(this.job?.failure ?? error);
    } finally { if (subject) subject.canvas.width = subject.canvas.height = 1; }
  }

  private showError(error: unknown) {
    this.stopCapture();
    this.stopPicking();
    this.state = { phase: 'error', error: error instanceof Error ? error.message : 'Could not create this showcase. Please try again.' };
    if (this.outline) this.outline.hidden = true;
    if (this.label) this.label.hidden = true;
    this.show();
  }
}
