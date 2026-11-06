import { compositionLayout } from '../capture/geometry';
import { defaultPreset, type ShowcasePreset } from './default-preset';

export async function drawBackdrop(context: CanvasRenderingContext2D, svg: string, width: number, height: number) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    context.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
  } finally {
    image.src = '';
    URL.revokeObjectURL(url);
  }
}

export async function renderShowcase(subject: HTMLCanvasElement, scaleX: number, scaleY: number, preset: ShowcasePreset = defaultPreset) {
  const layout = compositionLayout(subject, scaleX, scaleY, preset.padding, preset.maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable on this page.');
    if (preset.backgroundColor) {
      context.fillStyle = preset.backgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
    } else await drawBackdrop(context, preset.backdropSvg, canvas.width, canvas.height);
    context.imageSmoothingQuality = 'high';
    context.shadowColor = preset.shadow.color;
    context.shadowBlur = preset.shadow.blur * Math.min(scaleX, scaleY) * layout.scale;
    context.shadowOffsetY = preset.shadow.offsetY * scaleY * layout.scale;
    // The crop is opaque inside its silhouette, so its text never casts a separate shadow.
    const { x, y, width, height } = layout.subject;
    context.drawImage(subject, x, y, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      result => result ? resolve(result) : reject(new Error('Could not create the PNG. Try again.')), 'image/png'));
    return { blob, width: canvas.width, height: canvas.height };
  } finally { canvas.width = canvas.height = 1; }
}
