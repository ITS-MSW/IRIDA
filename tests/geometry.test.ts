import { expect, test } from 'bun:test';
import { compositionLayout, mapCrop, sameBounds, validateBounds } from '../lib/capture/geometry';
import { isCaptureMessage, isCaptureResponse, matchesRequest } from '../lib/messaging';

const viewport = { width: 1280, height: 800, contentWidth: 1265, contentHeight: 800 };
const rect = { x: 40.25, y: 80.5, width: 320.5, height: 200.25 };
const id = { sessionId: '11111111-1111-4111-8111-111111111111', requestId: '22222222-2222-4222-8222-222222222222' };

test('capture geometry and composition preserve pixels across density, zoom, rounding, and scrollbars', () => {
  for (const scale of [1, 1.25, 1.5, 2, 2.5]) {
    const crop = mapCrop(rect, viewport, { width: viewport.width * scale, height: viewport.height * scale });
    expect(crop.x).toBe(Math.round(rect.x * scale));
    expect(crop.y).toBe(Math.round(rect.y * scale));
    expect(crop.width).toBe(Math.round((rect.x + rect.width) * scale) - crop.x);
    expect(crop.height).toBe(Math.round((rect.y + rect.height) * scale) - crop.y);
    expect(crop.scaleX).toBe(scale);
    const output = compositionLayout(crop, crop.scaleX, crop.scaleY);
    expect(output.subject.width).toBe(crop.width);
    expect(output.subject.height).toBe(crop.height);
    expect(output.width).toBe(crop.width + Math.round(64 * scale) * 2);
    expect(output.subject.x).toBe(Math.round(64 * scale));
  }
  expect(mapCrop({ x: 1260, y: 10, width: 5, height: 10 }, viewport, { width: 2560, height: 1600 }).width).toBe(10);
  // Scroll position is deliberately absent: these coordinates already include scrolling.
  expect(mapCrop({ x: 12.2, y: 5.1, width: 51.4, height: 20 }, viewport, { width: 1280, height: 800 }).width).toBe(52);
  for (const subject of [{ width: 6000, height: 2400 }, { width: 1600, height: 8000 }, { width: 1, height: 1 }]) {
    const output = compositionLayout(subject, 2, 2);
    expect(Math.max(output.width, output.height)).toBeLessThanOrEqual(4096);
    expect(output.scale).toBeLessThanOrEqual(1);
    expect(output.subject.width).toBeLessThanOrEqual(subject.width);
    expect(output.subject.width / output.subject.height).toBeCloseTo(subject.width / subject.height);
  }
  expect(sameBounds(rect, { ...rect, x: rect.x + 0.1 })).toBe(true);
  expect(isCaptureMessage({ ...id, type: 'irida:capture', rect, viewport })).toBe(true);
  expect(isCaptureResponse({ ...id, ok: true, png: 'data:image/png;base64,AAA=' })).toBe(true);
  expect(matchesRequest(id, { ...id })).toBe(true);
});

test('reject invalid, clipped, moved, mismatched, or stale captures instead of exporting a wrong crop', () => {
  for (const invalid of [
    { ...rect, x: NaN }, { ...rect, width: 0 }, { ...rect, height: -1 }, { ...rect, x: -0.1 },
    { ...rect, x: 1100 }, { ...rect, y: 700 }, { ...rect, width: Infinity },
    { x: 1265, y: 0, width: 1, height: 1 },
  ]) expect(() => validateBounds(invalid, viewport)).toThrow();
  expect(() => mapCrop(rect, viewport, { width: 0, height: 800 })).toThrow();
  expect(() => mapCrop(rect, viewport, { width: 2560, height: 800 })).toThrow();
  expect(() => compositionLayout({ width: 0, height: 4 }, 1, 1)).toThrow();
  expect(sameBounds(rect, { ...rect, x: rect.x + 1 })).toBe(false);
  expect(isCaptureMessage({ ...id, type: 'irida:capture', rect: { ...rect, x: '40' }, viewport })).toBe(false);
  expect(isCaptureMessage({ type: 'irida:capture', rect, viewport })).toBe(false);
  expect(isCaptureResponse({ ...id, ok: true, png: 'https://example.com/image.png' })).toBe(false);
  expect(matchesRequest(id, { ...id, sessionId: '33333333-3333-4333-8333-333333333333' })).toBe(false);
  expect(matchesRequest(id, { ...id, requestId: '33333333-3333-4333-8333-333333333333' })).toBe(false);
});
