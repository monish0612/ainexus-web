import { describe, expect, it } from 'vitest';
import { blobToBase64, cropRect, isJpeg } from './avatarEncode';

function jpegFixture(n = 160, fill = 0x41): Uint8Array {
  const b = new Uint8Array(n);
  b.fill(fill);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  b[n - 2] = 0xff;
  b[n - 1] = 0xd9;
  return b;
}

describe('cropRect', () => {
  it('center-crops landscape, portrait, and square', () => {
    expect(cropRect(400, 200)).toEqual({ x: 100, y: 0, side: 200 });
    expect(cropRect(120, 360)).toEqual({ x: 0, y: 120, side: 120 });
    expect(cropRect(512, 512)).toEqual({ x: 0, y: 0, side: 512 });
    expect(cropRect(101, 51)).toEqual({ x: 25, y: 0, side: 51 });
  });

  it('clamps garbage dimensions to empty', () => {
    expect(cropRect(-4, 10).side).toBe(0);
  });
});

describe('isJpeg / blobToBase64', () => {
  it('requires SOI + EOI and a real payload', () => {
    expect(isJpeg(jpegFixture())).toBe(true);
    expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBe(false);
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });

  it('round-trips bytes through base64', () => {
    const jpeg = jpegFixture();
    expect(atob(blobToBase64(jpeg)).length).toBe(jpeg.length);
  });
});
