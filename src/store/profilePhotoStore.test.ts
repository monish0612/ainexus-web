import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/profilePhoto', () => ({
  fetchProfilePhotoMeta: vi.fn(),
  fetchProfilePhotoBlob: vi.fn(),
  uploadProfilePhoto: vi.fn(),
  deleteProfilePhoto: vi.fn(),
}));

vi.mock('@/lib/avatarEncode', () => ({
  encodeAvatarFile: vi.fn(() => Promise.resolve('BASE64')),
}));

import {
  fetchProfilePhotoBlob,
  fetchProfilePhotoMeta,
  uploadProfilePhoto,
} from '@/lib/api/profilePhoto';
import { useProfilePhotoStore } from './profilePhotoStore';

const meta = fetchProfilePhotoMeta as unknown as ReturnType<typeof vi.fn>;
const blob = fetchProfilePhotoBlob as unknown as ReturnType<typeof vi.fn>;
const upload = uploadProfilePhoto as unknown as ReturnType<typeof vi.fn>;

const SERVER_SHA = 'e3b0c44298fc1c149afbf4c8996fb924';
const JPEG = new Blob(['\xFF\xD8\xFF'], { type: 'image/jpeg' });

/**
 * Stands in for the real endpoint: `GET /profile/photo` answers 304 (→ null)
 * for any `If-None-Match` that matches what the server currently holds, and
 * 200 with bytes otherwise. This is the behaviour that made the avatar
 * invisible — the client was validating against the server's OWN sha, so the
 * first request could never come back with a body.
 */
function serveBlob(currentSha: string, bytes: Blob = JPEG) {
  blob.mockImplementation(async (sha?: string) => (sha === currentSha ? null : bytes));
}

beforeEach(() => {
  meta.mockReset();
  blob.mockReset();
  upload.mockReset();
  // jsdom has no object-URL support.
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:photo-${++n}`);
  URL.revokeObjectURL = vi.fn();
  useProfilePhotoStore.setState({ url: null, sha256: null, busy: false, error: null });
});

describe('profile photo hydrate', () => {
  it('renders the photo on the FIRST load (no validator when nothing is held)', async () => {
    meta.mockResolvedValue({ exists: true, sha256: SERVER_SHA });
    serveBlob(SERVER_SHA);

    await useProfilePhotoStore.getState().hydrate();

    // Nothing was cached, so there was nothing to revalidate against.
    expect(blob).toHaveBeenCalledTimes(1);
    expect(blob.mock.calls[0][0]).toBeUndefined();
    expect(useProfilePhotoStore.getState().url).toBe('blob:photo-1');
    expect(useProfilePhotoStore.getState().sha256).toBe(SERVER_SHA);
  });

  it('does not re-download when the sha is unchanged (caching still pays off)', async () => {
    meta.mockResolvedValue({ exists: true, sha256: SERVER_SHA });
    serveBlob(SERVER_SHA);

    await useProfilePhotoStore.getState().hydrate();
    const first = useProfilePhotoStore.getState().url;
    await useProfilePhotoStore.getState().hydrate();

    expect(blob).toHaveBeenCalledTimes(1); // second hydrate short-circuits
    expect(useProfilePhotoStore.getState().url).toBe(first);
  });

  it('revalidates with the sha we HOLD and picks up a photo changed elsewhere', async () => {
    meta.mockResolvedValue({ exists: true, sha256: SERVER_SHA });
    serveBlob(SERVER_SHA);
    await useProfilePhotoStore.getState().hydrate();

    // The phone uploaded a different photo.
    const NEW_SHA = 'd41d8cd98f00b204e9800998ecf8427e';
    meta.mockResolvedValue({ exists: true, sha256: NEW_SHA });
    serveBlob(NEW_SHA, new Blob(['new'], { type: 'image/jpeg' }));
    await useProfilePhotoStore.getState().hydrate();

    // The validator describes our copy, not the server's, so this is a 200.
    expect(blob).toHaveBeenLastCalledWith(SERVER_SHA);
    expect(useProfilePhotoStore.getState().url).toBe('blob:photo-2');
    expect(useProfilePhotoStore.getState().sha256).toBe(NEW_SHA);
  });

  it('clears the photo when the server says there is none', async () => {
    meta.mockResolvedValue({ exists: false });
    await useProfilePhotoStore.getState().hydrate();
    expect(blob).not.toHaveBeenCalled();
    expect(useProfilePhotoStore.getState().url).toBeNull();
  });
});

describe('profile photo upload', () => {
  it('shows the photo just uploaded instead of keeping the old one', async () => {
    const NEW_SHA = '5d41402abc4b2a76b9719d911017c592';
    upload.mockResolvedValue({ exists: true, sha256: NEW_SHA });
    serveBlob(NEW_SHA, new Blob(['fresh'], { type: 'image/jpeg' }));

    await useProfilePhotoStore.getState().setFromFile(new File([], 'a.jpg'));

    expect(blob.mock.calls[0][0]).toBeUndefined();
    expect(useProfilePhotoStore.getState().url).toBe('blob:photo-1');
    expect(useProfilePhotoStore.getState().sha256).toBe(NEW_SHA);
  });
});
