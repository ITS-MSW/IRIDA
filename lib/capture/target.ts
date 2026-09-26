import { composedParent, freshBounds } from '../picker/react-grab-adapter';
import { sameBounds, validateBounds, type Rect, type Viewport } from './geometry';

export interface TargetSnapshot {
  rect: Rect;
  viewport: Viewport;
  scrollX: number;
  scrollY: number;
  url: string;
  radius: number;
  pixelRatio: number;
}

function viewport(): Viewport {
  const visual = window.visualViewport;
  if (visual && (Math.abs(visual.scale - 1) > 0.001 || Math.abs(visual.offsetLeft) > 0.05 || Math.abs(visual.offsetTop) > 0.05)) {
    throw new Error('Pinch zoom is not supported. Reset pinch zoom and try again.');
  }
  return { width: innerWidth, height: innerHeight,
    contentWidth: document.documentElement.clientWidth, contentHeight: document.documentElement.clientHeight };
}

function cornerRadius(element: Element, rect: Rect): number {
  const style = getComputedStyle(element);
  const corners = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius];
  const resolved = corners.map(corner => {
    const parts = corner.split(/\s+/);
    const length = (part: string, size: number) => part.endsWith('%') ? parseFloat(part) * size / 100 : parseFloat(part);
    return [length(parts[0]!, rect.width), length(parts[1] ?? parts[0]!, rect.height)];
  });
  const radius = resolved[0]![0]!;
  if (!resolved.flat().every(value => Number.isFinite(value) && Math.abs(value - radius) <= 0.05)) {
    throw new Error('Choose a square element or a card with four equal, circular corners.');
  }
  if (radius > 0) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas is unavailable on this page.');
    context.fillStyle = style.backgroundColor;
    context.fillRect(0, 0, 1, 1);
    if (context.getImageData(0, 0, 1, 1).data[3] !== 255) {
      throw new Error('Choose a rounded card with a solid background, or a square section around it.');
    }
  }
  return Math.min(radius, rect.width / 2, rect.height / 2);
}

export function inspectTarget(element: Element): TargetSnapshot {
  if (!element.isConnected || element.ownerDocument !== document) throw new Error('This element was removed. Grab another element.');
  if (document.visibilityState !== 'visible') throw new Error('Return to this tab and try again.');
  const rect = freshBounds(element);
  const size = viewport();
  validateBounds(rect, size);
  if (element.getClientRects().length !== 1) throw new Error('Choose a single rectangular element.');
  for (let current: Element | null = element; current; current = composedParent(current)) {
    const style = getComputedStyle(current);
    if (style.transform !== 'none' || style.rotate !== 'none' || style.scale !== 'none' || style.translate !== 'none' ||
      (style.zoom !== '1' && style.zoom !== 'normal') || style.perspective !== 'none' ||
      style.clipPath !== 'none' || style.maskImage !== 'none') {
      throw new Error('Transformed or clipped elements are not supported. Choose an ordinary card or section.');
    }
    if (Number(style.opacity) < 1 || style.visibility !== 'visible' || style.display === 'none') {
      throw new Error('Choose a fully visible, opaque element.');
    }
    // A target can fit the viewport and still be chopped by a nested scroll container.
    if (current !== element && current !== document.body && current !== document.documentElement) {
      const bounds = current.getBoundingClientRect();
      const left = bounds.left + current.clientLeft;
      const top = bounds.top + current.clientTop;
      const clips = (overflow: string) => ['hidden', 'clip', 'scroll', 'auto'].includes(overflow);
      if ((clips(style.overflowX) && (rect.x < left - 0.05 || rect.x + rect.width > left + current.clientWidth + 0.05)) ||
        (clips(style.overflowY) && (rect.y < top - 0.05 || rect.y + rect.height > top + current.clientHeight + 0.05))) {
        throw new Error('This element is clipped by its container. Bring the whole element into view.');
      }
    }
  }
  return { rect, viewport: size, scrollX, scrollY, url: location.href, radius: cornerRadius(element, rect), pixelRatio: devicePixelRatio };
}

export function validateSnapshot(element: Element, snapshot: TargetSnapshot): void {
  const current = inspectTarget(element);
  if (current.url !== snapshot.url || !sameBounds(current.rect, snapshot.rect) ||
    Math.abs(current.scrollX - snapshot.scrollX) > 0.05 || Math.abs(current.scrollY - snapshot.scrollY) > 0.05 ||
    current.pixelRatio !== snapshot.pixelRatio || current.radius !== snapshot.radius ||
    (Object.keys(current.viewport) as (keyof Viewport)[]).some(key => current.viewport[key] !== snapshot.viewport[key])) {
    throw new Error('The page moved or changed size during capture. Hold it still and try again.');
  }
}
