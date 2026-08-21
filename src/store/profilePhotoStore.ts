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
      const blob = await fetchProfilePhotoBlob(meta.sha256);
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
      const blob = await fetchProfilePhotoBlob(meta.sha256);
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
