import { composedParent, freshBounds } from '../picker/react-grab-adapter';
import { clientClipBounds, matrixScale, resolveRadii, sameBounds, validateBounds, type CornerRadii, type Rect, type Scale, type Viewport } from './geometry';

export interface TargetSnapshot {
  rect: Rect;
  viewport: Viewport;
  scrollX: number;
  scrollY: number;
  url: string;
  radii: CornerRadii | null;
  scale: Scale;
  opacity: number;
  pixelRatio: number;
}

function viewport(): Viewport {
  const visual = window.visualViewport;
  if (visual && (Math.abs(visual.scale - 1) > 0.001 || Math.abs(visual.offsetLeft) > 0.05 || Math.abs(visual.offsetTop) > 0.05)) {
    throw new Error('Pinch zoom is not supported. Reset pinch zoom and try again.');
  }
  const root = document.compatMode === 'BackCompat' ? document.body : document.documentElement;
  return { width: innerWidth, height: innerHeight, contentWidth: root.clientWidth, contentHeight: root.clientHeight };
}

function cornerRadii(element: Element, style: CSSStyleDeclaration, rect: Rect, scale: Scale): CornerRadii | null {
  const corners = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius];
  const radii = resolveRadii(corners, rect, scale);
  if (!radii || radii.every(r => r.x === 0 || r.y === 0)) return null;
  const shape = style.getPropertyValue('corner-shape');
  if (shape && shape.split(/\s+/).some(value => value !== 'round' && value !== 'superellipse(1)')) return null;
  if (['IMG', 'VIDEO', 'CANVAS'].includes(element.tagName) ||
    [style.overflowX, style.overflowY].every(value => ['hidden', 'clip', 'scroll', 'auto'].includes(value))) return radii;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas is unavailable on this page.');
  context.fillStyle = style.backgroundColor;
  context.fillRect(0, 0, 1, 1);
  // A transparent wrapper's radius need not clip its children. Preserve the
  // rendered rectangle instead of removing content or rejecting the capture.
  return context.getImageData(0, 0, 1, 1).data[3] === 255 ? radii : null;
}

function localScale(style: CSSStyleDeclaration): Scale {
  const matrix = style.transform === 'none' ? { x: 1, y: 1 }
    : matrixScale(new DOMMatrixReadOnly(style.transform).toFloat64Array());
  const number = (value: string) => value.endsWith('%') ? parseFloat(value) / 100 : Number(value);
  const values = style.scale === 'none' ? [1] : style.scale.split(/\s+/).map(number);
  const zoom = style.zoom === 'normal' ? 1 : number(style.zoom);
  const rotated = style.rotate !== 'none' && parseFloat(style.rotate.split(/\s+/).at(-1)!) !== 0;
  if (!matrix || rotated || style.perspective !== 'none' || ![zoom, ...values].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Choose an element without rotation, skew, or perspective.');
  }
  return { x: matrix.x * values[0]! * zoom, y: matrix.y * (values[1] ?? values[0]!) * zoom };
}

export function inspectTarget(element: Element): TargetSnapshot {
  if (!element.isConnected || element.ownerDocument !== document) throw new Error('This element was removed. Grab another element.');
  if (document.visibilityState !== 'visible') throw new Error('Return to this tab and try again.');
  const rect = freshBounds(element);
  const size = viewport();
  validateBounds(rect, size);
  if (element.getClientRects().length !== 1) throw new Error('Choose a single rectangular element.');
  const ancestors: { element: Element; style: CSSStyleDeclaration }[] = [];
  for (let current: Element | null = element; current; current = composedParent(current)) {
    ancestors.push({ element: current, style: getComputedStyle(current) });
  }
  const ownStyle = ancestors[0]!.style;
  if (ownStyle.visibility !== 'visible') throw new Error('Choose a visible element.');
  const scale = { x: 1, y: 1 };
  let opacity = 1;
  // Walk inward so borders and scroll gutters use the same visual scale as bounds.
  for (const { element: current, style } of ancestors.reverse()) {
    const local = localScale(style);
    scale.x *= local.x;
    scale.y *= local.y;
    opacity *= Number(style.opacity);
    if (style.clipPath !== 'none' || style.maskImage !== 'none') {
      throw new Error('This element uses a custom mask or clip. Choose its surrounding section.');
    }
    if (opacity <= 0 || style.display === 'none') throw new Error('Choose a visible element.');
    // A target can fit the viewport and still be chopped by a nested scroll container.
    if (current !== element && current !== document.body && current !== document.documentElement && style.display !== 'inline') {
      const bounds = clientClipBounds(freshBounds(current), {
        left: current.clientLeft, top: current.clientTop, width: current.clientWidth, height: current.clientHeight,
      }, {
        left: parseFloat(style.borderLeftWidth), top: parseFloat(style.borderTopWidth),
        right: parseFloat(style.borderRightWidth), bottom: parseFloat(style.borderBottomWidth),
      }, scale);
      const clips = (overflow: string) => ['hidden', 'clip', 'scroll', 'auto'].includes(overflow);
      if ((clips(style.overflowX) && (rect.x < bounds.x - 0.05 || rect.x + rect.width > bounds.x + bounds.width + 0.05)) ||
        (clips(style.overflowY) && (rect.y < bounds.y - 0.05 || rect.y + rect.height > bounds.y + bounds.height + 0.05))) {
        throw new Error('This element is clipped by its container. Bring the whole element into view.');
      }
    }
  }
  return { rect, viewport: size, scrollX, scrollY, url: location.href, radii: cornerRadii(element, ownStyle, rect, scale), scale, opacity, pixelRatio: devicePixelRatio };
}

export function validateSnapshot(element: Element, snapshot: TargetSnapshot): void {
  const current = inspectTarget(element);
  if (current.url !== snapshot.url || !sameBounds(current.rect, snapshot.rect) ||
    Math.abs(current.scrollX - snapshot.scrollX) > 0.05 || Math.abs(current.scrollY - snapshot.scrollY) > 0.05 ||
    current.pixelRatio !== snapshot.pixelRatio || current.opacity !== snapshot.opacity ||
    current.scale.x !== snapshot.scale.x || current.scale.y !== snapshot.scale.y ||
    JSON.stringify(current.radii) !== JSON.stringify(snapshot.radii) ||
    (Object.keys(current.viewport) as (keyof Viewport)[]).some(key => current.viewport[key] !== snapshot.viewport[key])) {
    throw new Error('The page moved or changed size during capture. Hold it still and try again.');
  }
}

export function isCaptureScroll(element: Element, event: Event): boolean {
  if (event.target === document || event.target === window || event.composedPath().includes(element)) return true;
  for (let current: Element | null = element; current; current = composedParent(current)) {
    if (current === event.target) return true;
  }
  return false;
}
