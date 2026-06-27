import { api } from './client';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  ext: string;
  createdTime: string | null;
  modifiedTime: string | null;
  starred: boolean;
  thumbnailLink: string | null;
  isImage: boolean;
}

export interface Quota {
  usageBytes: number;
  limitBytes: number;
}

export async function listFiles(params: {
  pageToken?: string;
  q?: string;
}): Promise<{ files: DriveFile[]; nextPageToken: string | null }> {
  const { data } = await api.get('/cloud/files', { params });
  return { files: data.files ?? [], nextPageToken: data.nextPageToken ?? null };
}

export async function fetchQuota(): Promise<Quota> {
  const { data } = await api.get<Quota>('/cloud/quota');
  return data;
}

// Files larger than this are uploaded with the resumable/chunked protocol so a
// dropped connection (or a strict office proxy) doesn't force a restart from 0.
const RESUMABLE_THRESHOLD = 8 * 1024 * 1024; // 8 MiB
const DEFAULT_CHUNK = 8 * 1024 * 1024;
const MAX_CHUNK_RETRIES = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function uploadFile(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<DriveFile> {
  if (file.size > RESUMABLE_THRESHOLD) {
    return uploadFileResumable(file, onProgress);
  }
  return uploadSimple(file, onProgress);
}

async function uploadSimple(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<DriveFile> {
  const form = new FormData();
  form.append('file', file, file.name);
  const { data } = await api.post('/cloud/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 0, // large files — no client timeout
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
  return data.file;
}

interface ChunkResult {
  done: boolean;
  received?: number;
  file?: DriveFile;
}

async function uploadFileResumable(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<DriveFile> {
  const { data: start } = await api.post('/cloud/upload/resumable/start', {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
  });
  const uploadId: string = start.uploadId;
  const chunkSize: number = Number(start.chunkSize) || DEFAULT_CHUNK;
  const total = file.size;

  let offset = 0;
  let attempt = 0;
  const report = (loadedInChunk: number) => {
    if (!onProgress) return;
    onProgress(Math.min(99, Math.round(((offset + loadedInChunk) / total) * 100)));
  };

  while (offset < total) {
    const end = Math.min(offset + chunkSize, total);
    const blob = file.slice(offset, end);
    try {
      const { data } = await api.put<ChunkResult>(
        `/cloud/upload/resumable/${uploadId}`,
        blob,
        {
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-chunk-start': String(offset),
            'x-chunk-total': String(total),
          },
          timeout: 0,
          onUploadProgress: (e) => report(e.loaded),
        },
      );
      attempt = 0;
      if (data.done && data.file) {
        onProgress?.(100);
        return data.file;
      }
      // Server returns the authoritative committed offset; trust it.
      offset =
        typeof data.received === 'number' && data.received > offset
          ? data.received
          : end;
    } catch (err) {
      attempt += 1;
      if (attempt > MAX_CHUNK_RETRIES) throw err;
      await sleep(Math.min(1000 * 2 ** (attempt - 1), 15000));
      // Re-sync with the server so a chunk that actually landed (but whose
      // response was lost) isn't re-sent — and we resume from the real offset.
      try {
        const committed = await resumeOffset(uploadId);
        if (committed > offset) offset = committed;
      } catch {
        /* keep current offset and retry the same chunk */
      }
    }
  }

  // All bytes sent but no terminal "done" seen (rare) — finalize via status.
  const fin = await api.get<ChunkResult>(`/cloud/upload/resumable/${uploadId}/status`);
  if (fin.data.done && fin.data.file) {
    onProgress?.(100);
    return fin.data.file;
  }
  throw new Error('Upload finished sending but the file was not finalized');
}

async function resumeOffset(uploadId: string): Promise<number> {
  const { data } = await api.get<ChunkResult>(
    `/cloud/upload/resumable/${uploadId}/status`,
  );
  return Number(data.received || 0);
}

export async function deleteFile(id: string): Promise<void> {
  await api.delete(`/cloud/files/${id}`);
}

export async function starFile(id: string, starred: boolean): Promise<DriveFile> {
  const { data } = await api.post(`/cloud/files/${id}/star`, { starred });
  return data.file;
}

export function downloadUrl(id: string, inline = false): string {
  return `/api/v1/cloud/files/${id}/download${inline ? '?inline=1' : ''}`;
}

export function thumbnailUrl(id: string, size = 320): string {
  return `/api/v1/cloud/files/${id}/thumbnail?size=${size}`;
}
