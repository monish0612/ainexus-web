import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the axios instance so we drive uploadFile's logic without real HTTP.
vi.mock('./client', () => ({
  api: { post: vi.fn(), put: vi.fn(), get: vi.fn() },
}));

import { uploadFile } from './cloud';
import { api } from './client';

const mockApi = api as unknown as {
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};

const MB = 1024 * 1024;
const bigFile = (size: number, name = 'big.bin') =>
  new File([new Uint8Array(size)], name, { type: 'application/octet-stream' });

beforeEach(() => {
  mockApi.post.mockReset();
  mockApi.put.mockReset();
  mockApi.get.mockReset();
});

describe('uploadFile dispatch', () => {
  it('small file (≤8MB) uses the simple multipart upload', async () => {
    mockApi.post.mockResolvedValue({ data: { file: { id: 'S1' } } });
    const file = new File([new Uint8Array(1024)], 'small.txt', { type: 'text/plain' });

    const res = await uploadFile(file);

    expect(res).toEqual({ id: 'S1' });
    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(mockApi.post.mock.calls[0][0]).toBe('/cloud/upload');
    expect(mockApi.post.mock.calls[0][1] instanceof FormData).toBe(true);
    expect(mockApi.put).not.toHaveBeenCalled();
  });
});

describe('uploadFile resumable (>8MB)', () => {
  it('uploads in gap-free chunks and reports 100% on completion', async () => {
    const total = 9 * MB;
    const chunk = 4 * MB;
    mockApi.post.mockResolvedValue({ data: { uploadId: 'U1', chunkSize: chunk } });

    const seen: Array<{ start: number; size: number }> = [];
    mockApi.put.mockImplementation(async (_url: string, blob: Blob, cfg: any) => {
      const start = Number(cfg.headers['x-chunk-start']);
      seen.push({ start, size: blob.size });
      cfg.onUploadProgress?.({ loaded: blob.size, total: blob.size });
      const committed = start + blob.size;
      if (committed >= total) return { data: { done: true, file: { id: 'BIG' } } };
      return { data: { done: false, received: committed } };
    });

    const pcts: number[] = [];
    const res = await uploadFile(bigFile(total), (p) => pcts.push(p));

    expect(res).toEqual({ id: 'BIG' });
    // 4MB + 4MB + 1MB, sequential offsets, no gaps/overlaps.
    expect(seen.map((s) => s.size)).toEqual([4 * MB, 4 * MB, 1 * MB]);
    expect(seen.map((s) => s.start)).toEqual([0, 4 * MB, 8 * MB]);
    expect(pcts[pcts.length - 1]).toBe(100);
    // start posted exactly once with size metadata.
    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(mockApi.post.mock.calls[0][1]).toMatchObject({ size: total });
  });

  it('retries a dropped chunk, re-syncs the offset, and never duplicates', async () => {
    const total = 9 * MB;
    const chunk = 4 * MB;
    mockApi.post.mockResolvedValue({ data: { uploadId: 'U2', chunkSize: chunk } });

    const starts: number[] = [];
    let calls = 0;
    mockApi.put.mockImplementation(async (_url: string, blob: Blob, cfg: any) => {
      const start = Number(cfg.headers['x-chunk-start']);
      starts.push(start);
      calls += 1;
      if (calls === 2) throw new Error('Network Error'); // 2nd PUT drops
      const committed = start + blob.size;
      if (committed >= total) return { data: { done: true, file: { id: 'R' } } };
      return { data: { done: false, received: committed } };
    });
    // After the drop, /status reports the first chunk (4MB) as committed.
    mockApi.get.mockResolvedValue({ data: { done: false, received: chunk } });

    const res = await uploadFile(bigFile(total));

    expect(res).toEqual({ id: 'R' });
    expect(mockApi.get).toHaveBeenCalled(); // resynced before retry
    // 0 ok → 4MB fail → 4MB retry → 8MB ok. The failed offset is re-sent once
    // (resume), and the committed first chunk is never re-uploaded.
    expect(starts).toEqual([0, 4 * MB, 4 * MB, 8 * MB]);
  });

  it('finalizes via /status when the last chunk did not return done', async () => {
    const total = 9 * MB;
    mockApi.post.mockResolvedValue({ data: { uploadId: 'U3', chunkSize: total } });
    mockApi.put.mockResolvedValue({ data: { done: false, received: total } });
    mockApi.get.mockResolvedValue({ data: { done: true, file: { id: 'FIN' } } });

    const res = await uploadFile(bigFile(total));

    expect(res).toEqual({ id: 'FIN' });
    expect(mockApi.get).toHaveBeenCalledWith('/cloud/upload/resumable/U3/status');
  });
});
