import { api } from './client';

export interface ProfilePhotoMeta {
  exists: boolean;
  sha256?: string;
  bytes?: number;
  updatedAt?: string;
}

export function parseProfilePhotoMeta(raw: unknown): ProfilePhotoMeta {
  if (!raw || typeof raw !== 'object') return { exists: false };
  const o = raw as Record<string, unknown>;
  return {
    exists: o.exists === true,
    sha256: typeof o.sha256 === 'string' ? o.sha256 : undefined,
    bytes: typeof o.bytes === 'number' ? o.bytes : undefined,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : undefined,
  };
}

export async function fetchProfilePhotoMeta(): Promise<ProfilePhotoMeta> {
  try {
    const { data, status } = await api.get<unknown>('/profile/photo/meta');
    if (status === 204 || status === 404) return { exists: false };
    return parseProfilePhotoMeta(data);
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 204 || status === 404) return { exists: false };
    throw err;
  }
}

/** Returns the JPEG blob, or null when missing / unchanged (304). */
export async function fetchProfilePhotoBlob(sha256?: string): Promise<Blob | null> {
  try {
    const { data, status } = await api.get<ArrayBuffer>('/profile/photo', {
      responseType: 'arraybuffer',
      headers: {
        Accept: 'image/jpeg',
        ...(sha256 ? { 'If-None-Match': `"${sha256}"` } : {}),
      },
      validateStatus: (s) => (s >= 200 && s < 300) || s === 304 || s === 404,
    });
    if (status === 204 || status === 304 || status === 404) return null;
    if (!data || (data as ArrayBuffer).byteLength === 0) return null;
    return new Blob([data], { type: 'image/jpeg' });
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 204 || status === 304 || status === 404) return null;
    throw err;
  }
}

export async function uploadProfilePhoto(jpegBase64: string): Promise<ProfilePhotoMeta> {
  const { data } = await api.put<unknown>('/profile/photo', { jpegBase64 });
  return parseProfilePhotoMeta(data);
}

export async function deleteProfilePhoto(): Promise<void> {
  try {
    await api.delete('/profile/photo');
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 204 || status === 404) return;
    throw err;
  }
}
