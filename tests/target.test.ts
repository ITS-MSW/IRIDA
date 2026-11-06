import { expect, mock, test } from 'bun:test';
import type { Rect } from '../lib/capture/geometry';

mock.module('../lib/picker/react-grab-adapter', () => ({
  composedParent: (element: TestElement) => element.parent,
  freshBounds: (element: TestElement) => ({ ...element.rect }),
}));
const { inspectTarget, isCaptureScroll, validateSnapshot } = await import('../lib/capture/target');

const baseStyle = {
  transform: 'none', rotate: 'none', scale: 'none', translate: 'none', zoom: '1', perspective: 'none',
  clipPath: 'none', maskImage: 'none', opacity: '1', visibility: 'visible', display: 'block',
  overflowX: 'visible', overflowY: 'visible', backgroundColor: 'white', backgroundImage: 'none',
  borderTopLeftRadius: '0px', borderTopRightRadius: '0px', borderBottomRightRadius: '0px', borderBottomLeftRadius: '0px',
  borderLeftWidth: '0px', borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px',
  getPropertyValue: () => '',
};
interface TestElement {
  style: typeof baseStyle; rect: Rect; parent: TestElement | null; isConnected: boolean;
  ownerDocument: Document; tagName: string; clientLeft: number; clientTop: number; clientWidth: number; clientHeight: number;
  getClientRects(): Rect[];
}
function element(style: Partial<typeof baseStyle> = {}, rect: Rect = { x: 20, y: 30, width: 300, height: 200 }, parent: TestElement | null = null): TestElement {
  return {
    style: { ...baseStyle, ...style }, rect, parent, isConnected: true, ownerDocument: globalThis.document,
    tagName: 'DIV', clientLeft: 0, clientTop: 0, clientWidth: rect.width, clientHeight: rect.height,
    getClientRects: () => [rect],
  };
}
function inDocument(run: () => void) {
  const canvas = { fillStyle: '', fillRect() {}, clearRect() {}, getImageData() { return { data: [0, 0, 0, this.fillStyle === 'transparent' ? 0 : 255] }; } };
  const globals = {
    document: { visibilityState: 'visible', compatMode: 'CSS1Compat', documentElement: { clientWidth: 1200, clientHeight: 800 }, createElement: () => ({ getContext: () => canvas }) },
    window: { visualViewport: null }, innerWidth: 1200, innerHeight: 800, scrollX: 0, scrollY: 0,
    location: { href: 'https://example.com/' }, devicePixelRatio: 2,
    getComputedStyle: (element: TestElement) => element.style,
  };
  const descriptors = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  try { run(); } finally {
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}
const dom = (value: TestElement) => value as unknown as Element;

test('ordinary rendered cards remain capturable across corners, transparency, opacity and CSS scale', () => inDocument(() => {
  const cases = [
    element({ borderTopLeftRadius: '24px', borderTopRightRadius: '8px' }),
    element({ borderTopLeftRadius: '50%', borderTopRightRadius: '50%', borderBottomLeftRadius: '50%', borderBottomRightRadius: '50%' }),
    element({ backgroundColor: 'transparent', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }),
    element({ opacity: '0.95' }),
    element({ scale: '1.25 0.8' }),
    element({ zoom: '1.25' }),
  ];
  const failures = cases.map((candidate, index) => {
    try { inspectTarget(dom(candidate)); return null; }
    catch (error) { return { index, error: (error as Error).message }; }
  }).filter(Boolean);
  expect(failures).toEqual([]);
  expect(inspectTarget(dom(cases[0]!)).radii).toEqual([{ x: 24, y: 24 }, { x: 8, y: 8 }, { x: 0, y: 0 }, { x: 0, y: 0 }]);
  expect(inspectTarget(dom(cases[1]!)).radii).toEqual([{ x: 150, y: 100 }, { x: 150, y: 100 }, { x: 150, y: 100 }, { x: 150, y: 100 }]);
  expect(inspectTarget(dom(cases[2]!)).radii).toBeNull();
  expect(inspectTarget(dom(cases[3]!)).opacity).toBe(0.95);
  expect(inspectTarget(dom(cases[4]!)).scale).toEqual({ x: 1.25, y: 0.8 });
  expect(inspectTarget(dom(cases[5]!)).scale).toEqual({ x: 1.25, y: 1.25 });
  const parent = element({ scale: '2', overflowX: 'hidden', overflowY: 'hidden' }, { x: 20, y: 30, width: 600, height: 400 });
  parent.clientWidth = 300;
  parent.clientHeight = 200;
  const child = element({ scale: '1.5', borderTopLeftRadius: '10px' }, { x: 40, y: 50, width: 500, height: 300 }, parent);
  expect(inspectTarget(dom(child)).radii?.[0]).toEqual({ x: 30, y: 30 });
  const unrelatedScroll = { target: element(), composedPath: () => [window] } as unknown as Event;
  expect(isCaptureScroll(dom(child), unrelatedScroll)).toBe(false);
}));

test('removed, offscreen, clipped, rotated and moving targets never become successful crops', () => inDocument(() => {
  const target = element();
  const snapshot = inspectTarget(dom(target));
  target.rect.x += 4;
  expect(() => validateSnapshot(dom(target), snapshot)).toThrow('moved');
  target.isConnected = false;
  expect(() => inspectTarget(dom(target))).toThrow('removed');
  expect(() => inspectTarget(dom(element({}, { x: -2, y: 30, width: 300, height: 200 })))).toThrow('entire');
  expect(() => inspectTarget(dom(element({ rotate: '10deg' })))).toThrow();
  const parent = element({ overflowX: 'hidden' }, { x: 20, y: 30, width: 200, height: 200 });
  expect(() => inspectTarget(dom(element({}, { x: 20, y: 30, width: 300, height: 200 }, parent)))).toThrow('clipped');
  parent.style.scale = '2';
  parent.rect.width = 400;
  expect(() => inspectTarget(dom(element({}, { x: 20, y: 30, width: 410, height: 200 }, parent)))).toThrow('clipped');
  const changed = element({ opacity: '0.95' });
  const before = inspectTarget(dom(changed));
  changed.style.opacity = '0.8';
  expect(() => validateSnapshot(dom(changed), before)).toThrow('changed');
  const scroll = (target: unknown, path: unknown[] = []) => ({ target, composedPath: () => path }) as unknown as Event;
  expect(isCaptureScroll(dom(changed), scroll(document))).toBe(true);
  expect(isCaptureScroll(dom(changed), scroll(element(), [changed, document]))).toBe(true);
  expect(isCaptureScroll(dom(element({}, undefined, parent)), scroll(parent))).toBe(true);
}));
