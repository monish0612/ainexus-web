import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ImagePayload {
  base64: string; // no data: prefix
  mediaType: string;
}

function stripDataUrl(dataUrl: string): { base64: string; mediaType: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { mediaType: m[1], base64: m[2] };
  return { mediaType: 'image/jpeg', base64: dataUrl };
}

/** Read an image File into raw base64 + media type. */
export function imageFileToPayload(file: File): Promise<ImagePayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(stripDataUrl(String(reader.result)));
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Render the first page of a PDF to a JPEG and return it as base64 so it can be
 * sent to the vision receipt parser (mirrors the app's pdfx-render-then-OCR).
 */
export async function pdfFileToPayload(file: File): Promise<ImagePayload> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  // Render at ~2x for crisp text the vision model can read.
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(viewport.width, 2000);
  canvas.height = Math.round((canvas.width / viewport.width) * viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  const scale = canvas.width / viewport.width;
  await page.render({
    canvasContext: ctx,
    viewport: page.getViewport({ scale: 2 * scale }),
  }).promise;
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  return stripDataUrl(dataUrl);
}

export async function fileToReceiptPayload(file: File): Promise<ImagePayload> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return pdfFileToPayload(file);
  }
  return imageFileToPayload(file);
}
