export interface Rect { x: number; y: number; width: number; height: number }
export interface Size { width: number; height: number }
export interface Viewport extends Size { contentWidth: number; contentHeight: number }
export interface Scale { x: number; y: number }
export type CornerRadii = [Scale, Scale, Scale, Scale];

const ROUNDING_TOLERANCE = 0.05;

export function validateBounds(rect: Rect, viewport: Viewport): void {
  if (![rect.x, rect.y, rect.width, rect.height, viewport.width, viewport.height,
    viewport.contentWidth, viewport.contentHeight].every(Number.isFinite) ||
    rect.width < 1 || rect.height < 1 || viewport.width < 1 || viewport.height < 1 ||
    viewport.contentWidth < 1 || viewport.contentHeight < 1 ||
    viewport.contentWidth > viewport.width || viewport.contentHeight > viewport.height) {
    throw new Error('This element has unsupported dimensions. Choose another element.');
  }
  if (rect.x < -ROUNDING_TOLERANCE || rect.y < -ROUNDING_TOLERANCE ||
    rect.x + rect.width > viewport.contentWidth + ROUNDING_TOLERANCE ||
    rect.y + rect.height > viewport.contentHeight + ROUNDING_TOLERANCE) {
    throw new Error('Bring the entire element into view, then grab it again.');
  }
}

export function sameBounds(a: Rect, b: Rect, tolerance = 0.5): boolean {
  return (['x', 'y', 'width', 'height'] as const).every(key => Math.abs(a[key] - b[key]) <= tolerance);
}

export function matrixScale(matrix: ArrayLike<number>): Scale | null {
  // Positive axis-aligned scale and translation retain a rectangular silhouette.
  const valid = matrix.length === 16 && Array.from(matrix).every((value, index) =>
    Number.isFinite(value) && (index === 0 || index === 5 ? value > 0 :
      index >= 12 && index <= 14 || value === (index % 5 === 0 ? 1 : 0)));
  return valid ? { x: matrix[0]!, y: matrix[5]! } : null;
}

export function resolveRadii(corners: string[], size: Size, scale: Scale): CornerRadii | null {
  const length = (value: string, extent: number, factor: number) => {
    if (!/^(?:\d*\.)?\d+(?:px|%)?$/.test(value)) return NaN;
    return parseFloat(value) * (value.endsWith('%') ? extent / 100 : factor);
  };
  const radii = corners.map(corner => {
    const [x = '', y = x] = corner.trim().split(/\s+/);
    return { x: length(x, size.width, scale.x), y: length(y, size.height, scale.y) };
  });
  if (radii.length !== 4 || radii.some(r => !Number.isFinite(r.x) || !Number.isFinite(r.y))) return null;
  const [tl, tr, br, bl] = radii as CornerRadii;
  // CSS reduces all corners by one factor when adjacent radii overlap.
  const factor = Math.min(1, size.width / (tl.x + tr.x), size.width / (bl.x + br.x),
    size.height / (tl.y + bl.y), size.height / (tr.y + br.y));
  return radii.map(r => ({ x: r.x * factor, y: r.y * factor })) as CornerRadii;
}

export function clientClipBounds(bounds: Rect, client: Size & { left: number; top: number },
  border: { left: number; top: number; right: number; bottom: number }, scale: Scale = { x: 1, y: 1 }): Rect {
  const width = bounds.width / scale.x - border.left - border.right;
  const height = bounds.height / scale.y - border.top - border.bottom;
  // clientWidth/Height are integers. Use them to measure scrollbar gutters, not
  // as fractional clip edges: a 301.25px container can report clientHeight 301.
  return {
    x: bounds.x + (border.left + Math.max(0, client.left - Math.round(border.left))) * scale.x,
    y: bounds.y + (border.top + Math.max(0, client.top - Math.round(border.top))) * scale.y,
    width: (width - Math.max(0, Math.round(width) - client.width)) * scale.x,
    height: (height - Math.max(0, Math.round(height) - client.height)) * scale.y,
  };
}

export function mapCrop(rect: Rect, viewport: Viewport, bitmap: Size) {
  validateBounds(rect, viewport);
  if (![bitmap.width, bitmap.height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 32768) ||
    bitmap.width * bitmap.height > 100_000_000) {
    throw new Error('The captured viewport is too large or invalid.');
  }
  const scaleX = bitmap.width / viewport.width;
  const scaleY = bitmap.height / viewport.height;
  if (Math.abs(scaleX - scaleY) > Math.max(2 / viewport.width, 2 / viewport.height)) {
    throw new Error('The viewport changed size during capture. Try again.');
  }
  // Round edges independently; rounding a width compounds fractional offsets.
  // innerWidth/innerHeight include scrollbars, as does Chrome's captured bitmap.
  const x = Math.max(0, Math.round(rect.x * scaleX));
  const y = Math.max(0, Math.round(rect.y * scaleY));
  const right = Math.min(bitmap.width, Math.round((rect.x + rect.width) * scaleX));
  const bottom = Math.min(bitmap.height, Math.round((rect.y + rect.height) * scaleY));
  if (right <= x || bottom <= y) throw new Error('This element is too small to capture.');
  return { x, y, width: right - x, height: bottom - y, scaleX, scaleY };
}

export function compositionLayout(subject: Size, scaleX: number, scaleY: number, padding = 64, maxSide = 4096) {
  if (![subject.width, subject.height, scaleX, scaleY, maxSide].every(n => Number.isFinite(n) && n > 0) ||
    !Number.isFinite(padding) || padding < 0) throw new Error('Invalid composition dimensions.');
  const padX = Math.round(padding * scaleX);
  const padY = Math.round(padding * scaleY);
  const naturalWidth = subject.width + padX * 2;
  const naturalHeight = subject.height + padY * 2;
  const scale = Math.min(1, maxSide / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.floor(naturalWidth * scale));
  const height = Math.max(1, Math.floor(naturalHeight * scale));
  return {
    width, height, scale,
    subject: { x: (width - subject.width * scale) / 2, y: (height - subject.height * scale) / 2,
      width: subject.width * scale, height: subject.height * scale },
  };
}
