import { validateBounds, type Rect, type Viewport } from './capture/geometry';

export interface RequestId { sessionId: string; requestId: string }
export type ActivationMessage = { type: 'irida:activate' };
export type VerifyMessage = RequestId & { type: 'irida:verify' };
export type CaptureMessage = RequestId & { type: 'irida:capture'; rect: Rect; viewport: Viewport };
export type Message = ActivationMessage | VerifyMessage | CaptureMessage;
export type CaptureResponse = RequestId & ({ ok: true; png: string } | { ok: false; error: string });

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
export function isRequestId(value: unknown): value is RequestId {
  return isRecord(value) && ['sessionId', 'requestId'].every(key =>
    typeof value[key] === 'string' && /^[a-f0-9-]{36}$/.test(value[key]));
}
export function matchesRequest(expected: RequestId, received: RequestId): boolean {
  return expected.sessionId === received.sessionId && expected.requestId === received.requestId;
}
export function isCaptureMessage(value: unknown): value is CaptureMessage {
  if (!isRequestId(value) || !isRecord(value) || value.type !== 'irida:capture' ||
    !isRecord(value.rect) || !isRecord(value.viewport)) return false;
  try {
    validateBounds(value.rect as unknown as Rect, value.viewport as unknown as Viewport);
    return true;
  } catch { return false; }
}
export function isCaptureResponse(value: unknown): value is CaptureResponse {
  return isRequestId(value) && isRecord(value) && (value.ok === true
    ? typeof value.png === 'string' && value.png.startsWith('data:image/png;base64,')
    : value.ok === false && typeof value.error === 'string');
}
