import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({
  api: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { api } from './client';
import {
  deleteProfilePhoto,
  fetchProfilePhotoBlob,
  fetchProfilePhotoMeta,
  parseProfilePhotoMeta,
  uploadProfilePhoto,
} from './profilePhoto';

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.put.mockReset();
  mockApi.delete.mockReset();
});

describe('parseProfilePhotoMeta', () => {
  it('treats garbage as missing', () => {
    expect(parseProfilePhotoMeta(null)).toEqual({ exists: false });
    expect(parseProfilePhotoMeta('x').exists).toBe(false);
  });

  it('reads the live shape', () => {
    expect(
      parseProfilePhotoMeta({ exists: true, sha256: 'ab', bytes: 9, updatedAt: 't' }),
    ).toEqual({ exists: true, sha256: 'ab', bytes: 9, updatedAt: 't' });
  });
});

describe('profile photo API', () => {
  it('GET meta 204/404 is exists:false', async () => {
    mockApi.get.mockResolvedValue({ status: 204, data: null });
    expect(await fetchProfilePhotoMeta()).toEqual({ exists: false });
    mockApi.get.mockRejectedValue({ response: { status: 404 } });
    expect(await fetchProfilePhotoMeta()).toEqual({ exists: false });
  });

  it('GET blob treats 204/304 as null and 200 as a jpeg blob', async () => {
    mockApi.get.mockResolvedValue({ status: 304, data: new ArrayBuffer(0) });
    expect(await fetchProfilePhotoBlob('abc')).toBeNull();
    const buf = new Uint8Array([1, 2, 3]).buffer;
    mockApi.get.mockResolvedValue({ status: 200, data: buf });
    const blob = await fetchProfilePhotoBlob();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe('image/jpeg');
  });

  it('PUT sends jpegBase64 and DELETE is idempotent on 404', async () => {
    mockApi.put.mockResolvedValue({ data: { exists: true, sha256: 'ff' } });
    expect(await uploadProfilePhoto('AAAA')).toMatchObject({ exists: true, sha256: 'ff' });
    expect(mockApi.put.mock.calls[0][0]).toBe('/profile/photo');
    expect(mockApi.put.mock.calls[0][1]).toEqual({ jpegBase64: 'AAAA' });

    mockApi.delete.mockRejectedValue({ response: { status: 404 } });
    await deleteProfilePhoto();
  });
});
