import type { ReactNode } from 'react';
import {
  Cloud,
  Film,
  Globe,
  HardDrive,
  Server,
  ShieldAlert,
  Thermometer,
} from 'lucide-react';
import type { Quota } from '@/lib/api/cloud';
import type { NasFilesStatus, NasStatsEnvelope, StatMetric } from '@/lib/api/stats';
import { holdGb, holdIsMeaningful, mainPool, moviesUsedPct } from '@/lib/api/stats';
import { formatBytes, formatDueDate, formatGb, formatPct, relativeDays } from './format';
import { AMBER, RED, Card, Chip, Note, rampFor } from './chrome';
import { FluidBar, LiveSparkline } from './gauges';
import type { LiveSample } from './live';
import { spotsForMetric } from './live';

export function OverviewPanel({
  env,
  live,
  nasFiles,
  quota,
  transportError,
  onOpen,
  onGoNas,
  onGoVps,
}: {
  env: NasStatsEnvelope;
  live: LiveSample[];
  nasFiles: NasFilesStatus | undefined;
  quota: Quota | undefined;
  transportError: boolean;
  onOpen: (m: StatMetric) => void;
  onGoNas: () => void;
  onGoVps: () => void;
}) {
  const snap = env.snapshot;
  const vps = env.vpsLive;
  const alerts = collectAlerts(env, nasFiles, transportError);
  const movies = snap?.movies;
  const used = moviesUsedPct(movies) ?? 0;
  const domain = vps?.billing?.others.find((o) => (o.name ?? '').toLowerCase().includes('domain'));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatusTile
          label="NAS"
          value={transportError ? 'Unreachable' : env.online ? 'Online' : 'Off'}
          tone={transportError || !env.online ? 'bad' : 'good'}
          detail={snap?.host ?? 'truenas'}
          onClick={onGoNas}
        />
        <StatusTile
          label="VPS"
          value={transportError ? 'Silent' : vps?.state ?? 'Answering'}
          tone={transportError ? 'bad' : vps?.throttled ? 'warn' : 'good'}
          detail={vps?.planName ?? 'Hostinger'}
          onClick={onGoVps}
        />
        <StatusTile
          label="Nextcloud"
          value={
            !nasFiles
              ? '…'
              : !nasFiles.configured
                ? 'Not set'
                : nasFiles.reachable
                  ? 'Reachable'
                  : nasFiles.reason ?? 'Down'
          }
          tone={
            !nasFiles
              ? 'neutral'
              : !nasFiles.configured
                ? 'warn'
                : nasFiles.reachable
                  ? 'good'
                  : 'bad'
          }
          detail={nasFiles?.root ?? 'cloud.monishlabs.com'}
        />
        <StatusTile
          label="Google Drive"
          value={quota ? formatPct((quota.usageBytes / Math.max(quota.limitBytes, 1)) * 100, 0) : '…'}
          tone="info"
          detail={
            quota
              ? `${formatBytes(quota.usageBytes)} of ${formatBytes(quota.limitBytes)}`
              : 'Cloud tab'
          }
        />
      </div>

      {alerts.length > 0 && (
        <Card title="Needs attention" trailing={<Chip label={String(alerts.length)} tone="warn" />}>
          <ul className="flex flex-col gap-2">
            {alerts.map((a) => (
              <li key={a} className="flex items-start gap-2 text-[13px] text-fg2">
                <ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-400" />
                {a}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Film headroom">
          <button type="button" onClick={() => onOpen('nasDisk')} className="w-full text-left">
            <p className="font-mono text-4xl font-extrabold tabular-nums text-fg">
              {movies?.headlineFreeGb ?? '—'}
              <span className="ml-1.5 text-lg text-fg3">GB free</span>
            </p>
            <div className="mt-3">
              <FluidBar fraction={used / 100} color={rampFor(mainPool(snap)?.usedPct ?? used)} />
            </div>
            <p className="mt-2 text-[12px] text-fg3">
              Media dataset {movies?.dataset ?? 'Storage/media'} · tap for the live disk chart
            </p>
          </button>
          {holdIsMeaningful(snap?.snapshots) && (
            <div className="mt-3">
              <Note
                text={`Snapshots still hold ${holdGb(snap?.snapshots).toFixed(1)} GB. Deletes take 14 days to show as free space.`}
              />
            </div>
          )}
        </Card>

        <Card title="Billing & domain">
          {vps?.billing?.vps ? (
            <>
              <p className="text-lg font-extrabold text-fg">
                {vps.billing.vps.dueKind === 'expires' ? 'Expires' : 'Renews'}{' '}
                {formatDueDate(vps.billing.vps.dueAt)}
              </p>
              {vps.billing.vps.daysLeft != null && (
                <p className="text-[12px] text-fg3">
                  {vps.planName ?? vps.billing.vps.name} ·{' '}
                  {relativeDays(vps.billing.vps.daysLeft, vps.billing.vps.dueKind === 'expires')}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-fg3">No VPS subscription on the last billing read.</p>
          )}
          {domain && (
            <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
              <Globe size={14} className="text-fg3" />
              <div>
                <p className="text-[13px] font-bold text-fg">{domain.name ?? 'monishlabs.com'}</p>
                <p className="text-[12px] text-fg3">
                  {domain.dueKind === 'expires' ? 'Expires' : 'Renews'} {formatDueDate(domain.dueAt)}
                  {domain.daysLeft != null ? ` · ${relativeDays(domain.daysLeft, true)}` : ''}
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="NAS CPU · last 3 minutes">
          <button type="button" className="w-full" onClick={() => onOpen('nasCpu')}>
            <LiveSparkline spots={spotsForMetric(live, 'nasCpu')} height={140} interactive />
          </button>
        </Card>
        <Card title="VPS CPU · last 3 minutes">
          <button type="button" className="w-full" onClick={() => onOpen('vpsCpu')}>
            <LiveSparkline spots={spotsForMetric(live, 'vpsCpu')} height={140} interactive />
          </button>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Mini
          icon={<Server size={16} />}
          label="VPS RAM"
          value={formatPct(vps?.memPct, 1)}
          hint={vps?.memFreeGb != null ? `${formatGb(vps.memFreeGb)} free` : undefined}
        />
        <Mini
          icon={<HardDrive size={16} />}
          label="VPS disk"
          value={formatPct(vps?.diskPct, 1)}
          hint={vps?.diskFreeGb != null ? `${formatGb(vps.diskFreeGb)} free` : undefined}
        />
        <Mini
          icon={<Cloud size={16} />}
          label="Steal"
          value={formatPct(vps?.stealPct, 1)}
          hint="via NAS · 5 min"
          warn={(vps?.stealPct ?? 0) >= 20}
        />
        <Mini
          icon={<Thermometer size={16} />}
          label="Hottest disk"
          value={hottest(snap?.disks)}
          hint="SMART · live"
        />
        <Mini
          icon={<Film size={16} />}
          label="Playing"
          value={String(snap?.playback?.count ?? 0)}
          hint="Jellyfin sessions"
        />
        <Mini
          icon={<Server size={16} />}
          label="Containers"
          value={vps?.containers == null ? '—' : `${vps.running ?? 0}/${vps.containers}`}
          hint="Coolify stack"
          warn={
            vps?.containers != null &&
            vps.running != null &&
            vps.running < vps.containers
          }
        />
      </div>
    </div>
  );
}

function StatusTile({
  label,
  value,
  detail,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  tone: 'good' | 'warn' | 'bad' | 'info' | 'neutral';
  onClick?: () => void;
}) {
  const color =
    tone === 'good'
      ? '#51CF66'
      : tone === 'warn'
        ? AMBER
        : tone === 'bad'
          ? RED
          : tone === 'info'
            ? '#0D59F2'
            : 'var(--text3)';
  const inner = (
    <>
      <p className="text-[11px] font-bold uppercase tracking-wider text-fg3">{label}</p>
      <p className="mt-1 text-lg font-extrabold" style={{ color }}>
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-fg4">{detail}</p>
    </>
  );
  const cls = 'card p-4 text-left transition hover:bg-bg3/50';
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

function Mini({
  icon,
  label,
  value,
  hint,
  warn,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className="card flex items-start gap-3 p-4">
      <span className="text-fg3">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-fg3">{label}</p>
        <p className={`font-mono text-xl font-extrabold tabular-nums ${warn ? 'text-amber-400' : 'text-fg'}`}>
          {value}
        </p>
        {hint && <p className="text-[11px] text-fg4">{hint}</p>}
      </div>
    </div>
  );
}

function hottest(disks: { tempC: number | null; name: string | null }[] | undefined): string {
  if (!disks?.length) return '—';
  const ranked = disks.filter((d) => d.tempC != null).sort((a, b) => (b.tempC ?? 0) - (a.tempC ?? 0));
  const top = ranked[0];
  if (!top?.tempC) return '—';
  return `${top.tempC}°C ${top.name ?? ''}`.trim();
}

function collectAlerts(
  env: NasStatsEnvelope,
  nasFiles: NasFilesStatus | undefined,
  transportError: boolean,
): string[] {
  const out: string[] = [];
  if (transportError) out.push('The stats API did not answer. The VPS may be stopped or this browser is offline.');
  if (!env.online && !transportError) out.push('The NAS is off. Steal, containers and Nextcloud will look stale until it is back.');
  const vps = env.vpsLive;
  if (vps?.throttled) out.push('Hostinger is throttling the VPS — this is the early warning from 15 August.');
  if ((vps?.stealPct ?? 0) >= 20) out.push(`CPU steal is ${vps?.stealPct?.toFixed(1)}%. The hypervisor is holding the machine back.`);
  const snap = env.snapshot;
  for (const p of snap?.pools ?? []) {
    if (p.health && p.health !== 'ONLINE') out.push(`Pool ${p.name ?? ''} is ${p.health}.`);
    if ((p.usedPct ?? 0) >= 80) out.push(`Pool ${p.name ?? ''} is ${p.usedPct}% full. ZFS write performance degrades past 80%.`);
  }
  for (const d of snap?.disks ?? []) {
    if (d.ok === false) out.push(`Disk ${d.name ?? '?'} is reporting a SMART problem.`);
    if ((d.tempC ?? 0) >= 72) out.push(`Disk ${d.name ?? '?'} is ${d.tempC}°C — consumer SSDs throttle around 70°C.`);
  }
  if (snap?.memory?.pressure === 'critical') out.push('NAS memory is critical. A transcode is the usual cause.');
  if (nasFiles && nasFiles.configured && !nasFiles.reachable) {
    out.push(`Nextcloud is not reachable${nasFiles.reason ? ` (${nasFiles.reason})` : ''}.`);
  }
  const sub = vps?.billing?.vps;
  if (sub?.dueKind === 'expires' && sub.daysLeft != null && sub.daysLeft <= 30) {
    out.push(`The VPS subscription expires ${formatDueDate(sub.dueAt)}.`);
  }
  for (const o of vps?.billing?.others ?? []) {
    if (o.dueKind === 'expires' && o.daysLeft != null && o.daysLeft <= 30) {
      out.push(`${o.name ?? 'A subscription'} expires ${formatDueDate(o.dueAt)}.`);
    }
  }
  if (vps?.containers != null && vps.running != null && vps.running < vps.containers) {
    out.push(`Only ${vps.running} of ${vps.containers} containers are running.`);
  }
  return out;
}
