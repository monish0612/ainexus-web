export const AVATAR_EDGE_PX = 512;
export const MIN_AVATAR_EDGE_PX = 32;
export const MAX_AVATAR_SOURCE_BYTES = 20 * 1024 * 1024;

export function cropRect(width: number, height: number): {
  x: number;
  y: number;
  side: number;
} {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  const side = Math.min(w, h);
  return {
    x: Math.floor((w - side) / 2),
    y: Math.floor((h - side) / 2),
    side,
  };
}

export function isJpeg(bytes: Uint8Array): boolean {
  if (bytes.length < 128) return false;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return false;
  return bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
}

export function blobToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export async function encodeAvatarFile(file: File): Promise<string> {
  if (!file || file.size <= 0) {
    throw new Error('Photo is empty');
  }
  if (file.size > MAX_AVATAR_SOURCE_BYTES) {
    throw new Error('Photo is too large. Pick one under 20 MB.');
  }
  const bmp = await createImageBitmap(file);
  try {
    const { x, y, side } = cropRect(bmp.width, bmp.height);
    if (side < MIN_AVATAR_EDGE_PX) {
      throw new Error('Photo is too small.');
    }
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_EDGE_PX;
    canvas.height = AVATAR_EDGE_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Couldn't read that photo. Try another.");
    ctx.drawImage(bmp, x, y, side, side, 0, 0, AVATAR_EDGE_PX, AVATAR_EDGE_PX);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.88),
    );
    if (!blob) throw new Error("Couldn't read that photo. Try another.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!isJpeg(bytes)) {
      throw new Error("Couldn't read that photo. Try another.");
    }
    return blobToBase64(bytes);
  } finally {
    bmp.close();
  }
}
