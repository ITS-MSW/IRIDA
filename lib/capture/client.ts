import { browser } from 'wxt/browser';
import { isCaptureResponse, matchesRequest, type CaptureMessage } from '../messaging';
import { mapCrop } from './geometry';
import type { TargetSnapshot } from './target';

async function requestViewport(message: CaptureMessage, signal: AbortSignal): Promise<unknown> {
  let timeout: ReturnType<typeof setTimeout>;
  let onAbort: () => void;
  try {
    return await Promise.race([
      browser.runtime.sendMessage(message),
      new Promise<never>((_, reject) => {
        onAbort = () => reject(new DOMException('Capture cancelled', 'AbortError'));
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) onAbort();
        timeout = setTimeout(() => reject(new Error('Capture timed out. Click IRIDA and try again.')), 12_000);
      }),
    ]);
  } finally {
    clearTimeout(timeout!);
    signal.removeEventListener('abort', onAbort!);
  }
}

export async function captureSubject(message: CaptureMessage, snapshot: TargetSnapshot, signal: AbortSignal, validate: () => void) {
  let response = await requestViewport(message, signal);
  validate();
  if (!isCaptureResponse(response) || !matchesRequest(message, response)) throw new Error('This capture expired. Grab the element again.');
  if (!response.ok) throw new Error(response.error);
  const bitmap = await createImageBitmap(await (await fetch(response.png)).blob());
  response = null;
  try {
    validate();
    const crop = mapCrop(snapshot.rect, snapshot.viewport, bitmap);
    const canvas = document.createElement('canvas');
    canvas.width = crop.width;
    canvas.height = crop.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable on this page.');
    if (snapshot.radii) {
      context.beginPath();
      context.roundRect(0, 0, crop.width, crop.height, snapshot.radii.map(radius => ({ x: radius.x * crop.scaleX, y: radius.y * crop.scaleY })));
      context.clip();
    }
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    return { canvas, scaleX: crop.scaleX, scaleY: crop.scaleY };
  } finally { bitmap.close(); }
}

export function savePng(blob: Blob, container: HTMLElement): void {
  const date = new Date();
  const pad = (number: number) => String(number).padStart(2, '0');
  const filename = `showcase-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.png`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  container.append(link);
  link.click();
  link.remove();
  // A separate URL keeps an in-progress download valid when the preview closes.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
