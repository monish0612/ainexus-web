import { useMemo, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  CloudUpload,
  Download,
  File as FileIcon,
  FileText,
  Film,
  Music,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState, SkeletonCard, Spinner } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { apiErrorMessage } from '@/lib/api/client';
import { formatBytes, uuid } from '@/lib/format';
import {
  DriveFile,
  deleteFile,
  downloadUrl,
  fetchQuota,
  listFiles,
  starFile,
  thumbnailUrl,
  uploadFile,
} from '@/lib/api/cloud';

interface UploadJob {
  id: string;
  name: string;
  pct: number;
  status: 'uploading' | 'done' | 'error';
}

function QuotaRing({ usage, limit }: { usage: number; limit: number }) {
  const frac = limit > 0 ? Math.min(usage / limit, 1) : 0;
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-4">
      <div className="relative grid place-items-center">
        <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="var(--bg3)" strokeWidth="8" />
          <motion.circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke={frac > 0.9 ? '#FF6B6B' : '#0D59F2'}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - frac) }}
            transition={{ type: 'spring', damping: 24 }}
          />
        </svg>
        <span className="absolute text-xs font-bold text-fg">{Math.round(frac * 100)}%</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-fg">{formatBytes(usage)} used</p>
        <p className="text-xs text-fg3">of {formatBytes(limit)}</p>
      </div>
    </div>
  );
}

function fileGlyph(f: DriveFile) {
  if (f.isImage) return null;
  if (f.mimeType.startsWith('video/')) return <Film size={26} />;
  if (f.mimeType.startsWith('audio/')) return <Music size={26} />;
  if (f.mimeType.includes('pdf') || f.ext === 'pdf' || f.mimeType.includes('text'))
    return <FileText size={26} />;
  return <FileIcon size={26} />;
}

export default function CloudPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [drag, setDrag] = useState(false);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: quota } = useQuery({ queryKey: ['cloud-quota'], queryFn: fetchQuota });

  const filesQuery = useInfiniteQuery({
    queryKey: ['cloud-files', query],
    queryFn: ({ pageParam }) => listFiles({ pageToken: pageParam, q: query || undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextPageToken ?? undefined,
  });

  const files = useMemo(
    () => filesQuery.data?.pages.flatMap((p) => p.files) ?? [],
    [filesQuery.data],
  );

  const del = useMutation({
    mutationFn: deleteFile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cloud-files'] });
      qc.invalidateQueries({ queryKey: ['cloud-quota'] });
      toast.success('File deleted');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Delete failed')),
  });

  const star = useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) => starFile(id, starred),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cloud-files'] }),
  });

  async function handleFiles(list: FileList | File[]) {
    const arr = Array.from(list);
    for (const file of arr) {
      const jobId = uuid();
      setJobs((j) => [...j, { id: jobId, name: file.name, pct: 0, status: 'uploading' }]);
      try {
        await uploadFile(file, (pct) =>
          setJobs((j) => j.map((x) => (x.id === jobId ? { ...x, pct } : x))),
        );
        setJobs((j) => j.map((x) => (x.id === jobId ? { ...x, pct: 100, status: 'done' } : x)));
        setTimeout(() => setJobs((j) => j.filter((x) => x.id !== jobId)), 2500);
      } catch (err) {
        setJobs((j) => j.map((x) => (x.id === jobId ? { ...x, status: 'error' } : x)));
        toast.error(apiErrorMessage(err, `Upload failed: ${file.name}`));
      }
    }
    qc.invalidateQueries({ queryKey: ['cloud-files'] });
    qc.invalidateQueries({ queryKey: ['cloud-quota'] });
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Cloud"
        subtitle="Your files, synced everywhere"
        actions={quota && <QuotaRing usage={quota.usageBytes} limit={quota.limitBytes} />}
      />

      <div className="mx-auto w-full max-w-content flex-1 px-4 py-5 sm:px-6">
        {/* Upload dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
            drag ? 'border-accent bg-accent/10' : 'border-line bg-bg2 hover:bg-bg3'
          }`}
        >
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-white">
            <CloudUpload size={26} />
          </div>
          <div>
            <p className="font-semibold text-fg">Drop files to upload</p>
            <p className="text-sm text-fg3">or click to browse · any file type · multiple at once</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {/* Upload jobs */}
        <AnimatePresence>
          {jobs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 flex flex-col gap-2"
            >
              {jobs.map((j) => (
                <div key={j.id} className="card flex items-center gap-3 p-3">
                  {j.status === 'done' ? (
                    <CheckCircle2 size={18} className="text-emerald-400" />
                  ) : j.status === 'error' ? (
                    <X size={18} className="text-red-400" />
                  ) : (
                    <Spinner size={18} className="text-accent" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{j.name}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg3">
                      <motion.div
                        className="h-full rounded-full bg-accent"
                        animate={{ width: `${j.pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-fg3">{j.pct}%</span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
          }}
          className="relative mt-5"
        >
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg4" />
          <input
            className="input pl-11"
            placeholder="Search files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        {/* Files grid */}
        <div className="mt-5">
          {filesQuery.isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} className="h-40" />
              ))}
            </div>
          ) : files.length === 0 ? (
            <EmptyState
              icon={<CloudUpload size={28} />}
              title="No files yet"
              hint="Upload your first file to see it here."
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {files.map((f) => (
                  <motion.div
                    key={f.id}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="card group flex flex-col overflow-hidden"
                  >
                    <div className="relative grid h-28 place-items-center bg-bg2 text-fg3">
                      {f.isImage ? (
                        <img
                          src={thumbnailUrl(f.id)}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        fileGlyph(f)
                      )}
                      <button
                        onClick={() => star.mutate({ id: f.id, starred: !f.starred })}
                        className={`absolute right-2 top-2 rounded-lg p-1.5 backdrop-blur transition ${
                          f.starred ? 'text-amber-400' : 'text-white/70 hover:text-white'
                        } bg-black/30`}
                        aria-label="Star"
                      >
                        <Star size={15} fill={f.starred ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                    <div className="flex flex-1 flex-col p-3">
                      <p className="truncate text-sm font-semibold text-fg" title={f.name}>
                        {f.name}
                      </p>
                      <p className="text-xs text-fg4">{formatBytes(f.size)}</p>
                      <div className="mt-2 flex items-center gap-1">
                        <a
                          href={downloadUrl(f.id)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-bg3 py-1.5 text-xs font-semibold text-fg2 transition hover:text-fg"
                        >
                          <Download size={14} /> Download
                        </a>
                        <button
                          onClick={() => del.mutate(f.id)}
                          className="rounded-lg bg-bg3 p-1.5 text-fg3 transition hover:bg-red-500/15 hover:text-red-400"
                          aria-label="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {filesQuery.hasNextPage && (
                <div className="mt-5 flex justify-center">
                  <button
                    onClick={() => filesQuery.fetchNextPage()}
                    disabled={filesQuery.isFetchingNextPage}
                    className="btn-ghost px-5 py-2.5 text-sm"
                  >
                    {filesQuery.isFetchingNextPage ? <Spinner size={16} /> : null}
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
