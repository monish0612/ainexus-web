import { create } from 'zustand';
import {
  deleteProfilePhoto,
  fetchProfilePhotoBlob,
  fetchProfilePhotoMeta,
  uploadProfilePhoto,
} from '@/lib/api/profilePhoto';
import { encodeAvatarFile } from '@/lib/avatarEncode';

interface ProfilePhotoState {
  url: string | null;
  sha256: string | null;
  busy: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  setFromFile: (file: File) => Promise<void>;
  remove: () => Promise<void>;
  reset: () => void;
}

function revoke(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}

export const useProfilePhotoStore = create<ProfilePhotoState>((set, get) => ({
  url: null,
  sha256: null,
  busy: false,
  error: null,

  hydrate: async () => {
    try {
      const meta = await fetchProfilePhotoMeta();
      if (!meta.exists) {
        revoke(get().url);
        set({ url: null, sha256: null, error: null });
        return;
      }
      if (meta.sha256 && meta.sha256 === get().sha256 && get().url) return;
      // The validator has to describe the copy we ALREADY hold. Sending the
      // sha the meta call just reported always matches the server's ETag, so
      // the very first load would 304 with an empty body and the avatar would
      // never appear. With our own sha the revalidation still short-circuits a
      // re-download when nothing changed, and returns bytes when it did.
      const held = get().url ? (get().sha256 ?? undefined) : undefined;
      const blob = await fetchProfilePhotoBlob(held);
      if (!blob) return;
      revoke(get().url);
      set({
        url: URL.createObjectURL(blob),
        sha256: meta.sha256 ?? null,
        error: null,
      });
    } catch {
      // Offline: keep whatever we already show.
    }
  },

  setFromFile: async (file) => {
    set({ busy: true, error: null });
    try {
      const jpegBase64 = await encodeAvatarFile(file);
      const meta = await uploadProfilePhoto(jpegBase64);
      // Unconditional: we want the bytes we just uploaded, and a conditional
      // GET carrying the sha the upload returned would always come back 304.
      const blob = await fetchProfilePhotoBlob();
      revoke(get().url);
      set({
        url: blob ? URL.createObjectURL(blob) : get().url,
        sha256: meta.sha256 ?? null,
        busy: false,
        error: null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save that photo. Try another.';
      set({ busy: false, error: msg });
      throw e;
    }
  },

  remove: async () => {
    set({ busy: true, error: null });
    try {
      await deleteProfilePhoto();
      revoke(get().url);
      set({ url: null, sha256: null, busy: false });
    } catch (e) {
      set({ busy: false, error: 'Could not remove that photo.' });
      throw e;
    }
  },

  reset: () => {
    revoke(get().url);
    set({ url: null, sha256: null, busy: false, error: null });
  },
}));
