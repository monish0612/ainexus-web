import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, SubTabs } from '@/components/layout/PageHeader';
import { Spinner } from '@/components/ui/primitives';
import { fetchQuota } from '@/lib/api/cloud';
import {
  OFFLINE_MESSAGE,
  fetchNasFilesStatus,
  fetchStats,
  type NasStatsEnvelope,
  type StatMetric,
} from '@/lib/api/stats';
import { formatAgo } from './format';
import { Banner, LiveDot, StalledNote } from './chrome';
import { useWide } from './gauges';
import { OverviewPanel } from './OverviewPanel';
import { NasPanel } from './NasPanel';
import { VpsPanel } from './VpsPanel';
import { StatDetailModal } from './StatDetailModal';
import { appendLiveSample, sampleFromEnvelope, type LiveSample } from './live';

type Tab = 'overview' | 'nas' | 'vps';

export default function OpsPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [metric, setMetric] = useState<StatMetric | null>(null);
  const wide = useWide();
  const liveRef = useRef<LiveSample[]>([]);
  const [live, setLive] = useState<LiveSample[]>([]);

  const stats = useQuery({
    queryKey: ['ops-stats'],
    queryFn: fetchStats,
    refetchInterval: 1000,
    refetchIntervalInBackground: false,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const nasFiles = useQuery({
    queryKey: ['ops-nas-files'],
    queryFn: fetchNasFilesStatus,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const quota = useQuery({
    queryKey: ['cloud-quota'],
    queryFn: fetchQuota,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!stats.data) return;
    liveRef.current = appendLiveSample(liveRef.current, sampleFromEnvelope(stats.data));
    setLive(liveRef.current);
  }, [stats.data]);

  const env: NasStatsEnvelope | undefined = stats.data;
  const transportError = stats.isError;
  const hasLoaded = stats.isSuccess || stats.isError;
  const nasOffline = !env?.online;
  const stalled = Boolean(env?.online && (env.ageS ?? 0) > 30);

  const subtitle = (() => {
    if (transportError) return 'Not connected';
    if (!env) return 'Reading…';
    if (tab === 'nas') {
      if (!env.online) return 'Switched off';
      const v = env.snapshot?.version;
      return v ? `TrueNAS ${v}` : 'NAS';
    }
    if (tab === 'vps') return env.vpsLive?.planName ?? 'Hostinger VPS';
    return env.online ? 'All systems' : 'NAS is off · VPS still answering';
  })();

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Ops"
        subtitle={subtitle}
        actions={
          <div className="flex flex-col items-end gap-0.5">
            <LiveDot live={Boolean(!transportError && env && (tab === 'vps' || env.online))} />
            {env?.ageS != null && env.online && (
              <span className="text-[10px] text-fg4">{formatAgo(env.ageS)}</span>
            )}
          </div>
        }
        tabs={
          <SubTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'overview', label: 'Overview' },
              { value: 'nas', label: 'NAS' },
              { value: 'vps', label: 'VPS' },
            ]}
          />
        }
      />

      <div className="mx-auto w-full max-w-content flex-1 px-4 py-5 sm:px-6">
        {!hasLoaded ? (
          <div className="grid h-64 place-items-center text-fg3">
            <div className="flex flex-col items-center gap-3">
              <Spinner size={26} />
              <p className="text-sm font-semibold">Reading your machines…</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {transportError && (
              <Banner
                fault
                title="Can't reach the stats server"
                message="This browser could not reach the API. Nothing here says the NAS is off — only that the VPS did not answer."
                onRetry={() => void stats.refetch()}
              />
            )}
            {!transportError && env && nasOffline && tab !== 'vps' && (
              <Banner
                fault={env.reason === 'auth'}
                title="Your NAS is off"
                message={OFFLINE_MESSAGE[env.reason ?? 'unknown']}
                lastSeen={env.lastSeenAt ? formatAgo(Math.max(0, Math.floor(Date.now() / 1000) - env.lastSeenAt)) : undefined}
                onRetry={() => void stats.refetch()}
              />
            )}
            {!transportError && stalled && tab === 'nas' && (
              <StalledNote age={formatAgo(env?.ageS)} />
            )}

            {tab === 'overview' && env && (
              <OverviewPanel
                env={env}
                live={live}
                nasFiles={nasFiles.data}
                quota={quota.data}
                transportError={transportError}
                onOpen={setMetric}
                onGoNas={() => setTab('nas')}
                onGoVps={() => setTab('vps')}
              />
            )}
            {tab === 'nas' && env && (
              <NasPanel
                env={env}
                live={live}
                wide={wide}
                offline={nasOffline}
                onOpen={setMetric}
              />
            )}
            {tab === 'vps' && env && (
              <VpsPanel
                env={env}
                live={live}
                wide={wide}
                unreachable={transportError}
                onOpen={setMetric}
              />
            )}
          </div>
        )}
      </div>

      <StatDetailModal metric={metric} live={live} onClose={() => setMetric(null)} />
    </div>
  );
}
