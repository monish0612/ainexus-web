import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Segmented, Spinner } from '@/components/ui/primitives';
import type { HistoryRange, StatMetric } from '@/lib/api/stats';
import { METRIC_META, fetchHistory } from '@/lib/api/stats';
import { LiveSparkline } from './gauges';
import { historySpots, spotsForMetric, type LiveSample } from './live';

export function StatDetailModal({
  metric,
  live,
  onClose,
}: {
  metric: StatMetric | null;
  live: LiveSample[];
  onClose: () => void;
}) {
  const [range, setRange] = useState<HistoryRange>('now');
  const meta = metric ? METRIC_META[metric] : null;

  useEffect(() => {
    setRange('now');
  }, [metric]);
  const hist = useQuery({
    queryKey: ['ops-history', range, metric],
    queryFn: () => fetchHistory(range),
    enabled: metric != null && range !== 'now',
    staleTime: 15_000,
    retry: false,
  });

  const spots = useMemo(() => {
    if (!metric) return [];
    if (range === 'now') return spotsForMetric(live, metric);
    const env = hist.data;
    if (!env) return [];
    const series = meta?.host === 'NAS' ? env.nas : env.vps;
    return historySpots(series, metric);
  }, [metric, range, live, hist.data, meta]);

  return (
    <Modal
      open={metric != null}
      onClose={onClose}
      title={meta ? `${meta.host} ${meta.label}` : 'Stat'}
      maxWidth="max-w-3xl"
    >
      <div className="flex flex-col gap-4 p-5">
        <Segmented
          value={range}
          onChange={(v) => setRange(v)}
          options={[
            { value: 'now', label: 'Now' },
            { value: '7d', label: '7D' },
            { value: '30d', label: '30D' },
          ]}
        />
        {range !== 'now' && hist.isLoading ? (
          <div className="grid h-64 place-items-center text-fg3">
            <Spinner size={22} />
          </div>
        ) : range !== 'now' && hist.isError ? (
          <div className="grid h-64 place-items-center px-6 text-center text-[13px] leading-relaxed text-fg3">
            History could not be loaded. The live 1-second view is still running — switch back to Now.
          </div>
        ) : (
          <LiveSparkline spots={spots} height={280} interactive range={range} />
        )}
        <p className="text-[12px] leading-relaxed text-fg3">
          {range === 'now'
            ? 'Fed by the same 1-second poll as the dashboard. Closing this does not start a second connection.'
            : range === '7d'
              ? 'In-memory 7-day series from the API and NAS. Empty after a restart until the rings fill again.'
              : 'In-memory 30-day series. Same honesty contract: missing is a gap, never a zero.'}
        </p>
      </div>
    </Modal>
  );
}
