import { getElementAtPoint, getElementBounds, isElementGrabbable } from 'react-grab/primitives';
import type { Rect } from '../capture/geometry';

export function composedParent(element: Element): Element | null {
  const root = element.getRootNode();
  return element.assignedSlot ?? element.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
}

export function isOurElement(element: Element, host: HTMLElement): boolean {
  for (let current: Element | null = element; current; current = composedParent(current)) {
    if (current === host) return true;
  }
  return false;
}

export function isUseful(element: Element, host: HTMLElement): boolean {
  return element.ownerDocument === document && element.isConnected &&
    !['HTML', 'BODY', 'IFRAME', 'OBJECT', 'EMBED'].includes(element.tagName) &&
    !isOurElement(element, host) && isElementGrabbable(element);
}

export function elementAtPoint(x: number, y: number, host: HTMLElement): Element | null {
  if (document.elementFromPoint(x, y) instanceof HTMLIFrameElement) return null;
  return getElementAtPoint(x, y, { filter: candidate => isUseful(candidate, host) });
}

export function elementBounds(element: Element): Rect & { borderRadius: string } {
  const { x, y, width, height, borderRadius } = getElementBounds(element);
  return { x, y, width, height, borderRadius };
}

export function freshBounds(element: Element): Rect {
  // Upstream highlight bounds have a short cache. Capture checks must read layout now.
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
}
