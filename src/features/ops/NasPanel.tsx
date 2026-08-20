import {
  AlertTriangle,
  Cpu,
  Database,
  Film,
  HardDrive,
  HeartPulse,
  Home,
  MemoryStick,
  Server,
  Thermometer,
  Usb,
} from 'lucide-react';
import type { LiveSample } from './live';
import { spotsForMetric } from './live';
import { Card, Chip, Note, Shroud, StatRow, rampFor, AMBER, RED } from './chrome';
import { FluidBar, FluidGauge, LiveSparkline } from './gauges';
import { UNKNOWN, formatBytes, formatDuration } from './format';
import type { NasSnapshot, NasStatsEnvelope, StatMetric } from '@/lib/api/stats';
import {
  backupPool,
  holdGb,
  holdIsMeaningful,
  loadPerCore,
  mainPool,
  memUsedPct,
  moviesUsedPct,
} from '@/lib/api/stats';

export function NasPanel({
  env,
  live,
  wide,
  offline,
  onOpen,
}: {
  env: NasStatsEnvelope;
  live: LiveSample[];
  wide: boolean;
  offline: boolean;
  onOpen: (m: StatMetric) => void;
}) {
  const snap = env.snapshot;
  return (
    <Shroud offline={offline}>
      <div className="grid gap-4 lg:grid-cols-2">
        <FilmHero snapshot={snap} live={live} wide={wide} onOpen={() => onOpen('nasDisk')} />
        <LoadCard snapshot={snap} live={live} wide={wide} onOpen={onOpen} />
        <PoolsCard snapshot={snap} />
        <DisksCard snapshot={snap} />
        <ServicesCard snapshot={snap} />
        {snap?.playback?.items.length ? <NowPlaying snapshot={snap} /> : null}
        <SystemCard snapshot={snap} />
      </div>
    </Shroud>
  );
}

function FilmHero({
  snapshot,
  live,
  wide,
  onOpen,
}: {
  snapshot: NasSnapshot | null;
  live: LiveSample[];
  wide: boolean;
  onOpen: () => void;
}) {
  const movies = snapshot?.movies;
  const main = mainPool(snapshot);
  const backup = backupPool(snapshot);
  const freeGb = movies?.headlineFreeGb;
  const usedPct = moviesUsedPct(movies) ?? 0;
  const tint = rampFor(main?.usedPct ?? usedPct);
  return (
    <Card
      title="Free for films"
      trailing={
        main ? (
          <Chip
            label={main.health === 'ONLINE' ? 'Healthy' : main.health ?? 'Unknown'}
            tone={main.health === 'ONLINE' ? 'good' : 'bad'}
          />
        ) : undefined
      }
      className="lg:col-span-2"
    >
      <button type="button" onClick={onOpen} className="w-full text-left">
        <p className="font-mono text-4xl font-extrabold tabular-nums tracking-tight text-fg sm:text-5xl">
          {freeGb == null ? UNKNOWN : freeGb}
          <span className="ml-1.5 text-lg font-bold text-fg3">GB</span>
        </p>
        <div className="mt-3">
          <FluidBar fraction={usedPct / 100} color={tint} height={11} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {main && (
            <Chip
              icon={<Film size={12} />}
              label={`${main.name ?? 'Storage'} ${main.usedPct ?? 0}% used`}
              tone={(main.usedPct ?? 0) >= 80 ? 'bad' : (main.usedPct ?? 0) >= 70 ? 'warn' : 'neutral'}
            />
          )}
          {backup && (
            <Chip
              icon={<Usb size={12} />}
              label={`USB backup ${backup.usedPct ?? 0}% used`}
              tone={backup.health === 'ONLINE' ? 'neutral' : 'bad'}
            />
          )}
        </div>
      </button>
      {movies?.dataset && (
        <p className="mt-3 font-mono text-[11px] text-fg4">
          {movies.dataset}
          {movies.path ? ` · ${movies.path}` : ''}
        </p>
      )}
      {holdIsMeaningful(snapshot?.snapshots) && (
        <div className="mt-3">
          <Note
            text={`Deleting a film does not free space for 14 days — snapshots are currently holding ${holdGb(snapshot?.snapshots).toFixed(1)} GB across ${snapshot?.snapshots?.countStorage ?? 0} snapshots. This is your safety net, not wasted space.`}
          />
        </div>
      )}
      {wide && (
        <div className="mt-4">
          <LiveSparkline spots={spotsForMetric(live, 'nasDisk')} height={96} />
        </div>
      )}
    </Card>
  );
}

function LoadCard({
  snapshot,
  live,
  wide,
  onOpen,
}: {
  snapshot: NasSnapshot | null;
  live: LiveSample[];
  wide: boolean;
  onOpen: (m: StatMetric) => void;
}) {
  const cpu = snapshot?.cpu;
  const mem = snapshot?.memory;
  const memColor =
    mem?.pressure === 'critical' ? RED : mem?.pressure === 'low' ? AMBER : undefined;
  const n = (v: number | null | undefined) => (v == null ? UNKNOWN : v.toFixed(2));
  return (
    <Card title="Load">
      <div className="flex justify-around gap-2">
        <div className="flex flex-1 flex-col items-center">
          <FluidGauge
            value={snapshot == null ? 0 : cpu?.pct ?? null}
            label="CPU"
            decimals={(cpu?.pct ?? 100) < 10 ? 1 : 0}
            subtitle={cpu?.cores == null ? null : `${cpu.cores} cores`}
            onClick={() => onOpen('nasCpu')}
          />
          {wide && (
            <div className="mt-2 w-full">
              <LiveSparkline spots={spotsForMetric(live, 'nasCpu')} height={80} />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col items-center">
          <FluidGauge
            value={snapshot == null ? 0 : memUsedPct(mem)}
            label="RAM"
            color={memColor}
            subtitle={mem?.availableMb == null ? null : `${mem.availableMb} MB free`}
            onClick={() => onOpen('nasRam')}
          />
          {wide && (
            <div className="mt-2 w-full">
              <LiveSparkline spots={spotsForMetric(live, 'nasRam')} height={80} />
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 border-t border-line pt-2">
        <StatRow
          icon={<Cpu size={14} />}
          label="Load average (1 / 5 / 15 min)"
          value={cpu ? `${n(cpu.load1)} · ${n(cpu.load5)} · ${n(cpu.load15)}` : UNKNOWN}
          valueColor={(loadPerCore(cpu) ?? 0) >= 1 ? AMBER : undefined}
        />
        <StatRow
          icon={<MemoryStick size={14} />}
          label="Total memory"
          value={mem?.totalMb == null ? UNKNOWN : `${(mem.totalMb / 1024).toFixed(1)} GB`}
        />
        <StatRow
          icon={<Database size={14} />}
          label="ZFS cache (ARC)"
          value={
            mem?.arcMb == null
              ? UNKNOWN
              : mem.arcCapMb == null
                ? `${mem.arcMb} MB`
                : `${mem.arcMb} / ${mem.arcCapMb} MB`
          }
        />
      </div>
      {mem?.pressure === 'critical' && (
        <div className="mt-3">
          <Note
            warn
            text="Memory is very tight. Playback can fail while it is this low; a transcode is the usual cause."
          />
        </div>
      )}
    </Card>
  );
}

function PoolsCard({ snapshot }: { snapshot: NasSnapshot | null }) {
  const pools = snapshot?.pools ?? [];
  return (
    <Card title="Storage pools">
      {pools.length === 0 ? (
        <p className="text-[13px] text-fg3">
          {snapshot == null ? 'Unavailable while the NAS is off.' : 'No pools reported.'}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {pools.map((p) => {
            const pct = p.usedPct ?? 0;
            return (
              <div key={`${p.name}-${p.role}`}>
                <div className="mb-2 flex items-center gap-2">
                  {p.role === 'backup_usb' ? (
                    <Usb size={14} className="text-fg3" />
                  ) : (
                    <HardDrive size={14} className="text-fg3" />
                  )}
                  <p className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-fg">
                    {p.role === 'backup_usb'
                      ? `${p.name ?? 'Backup'} · USB backup disk`
                      : p.name ?? 'Pool'}
                  </p>
                  <Chip label={p.health ?? 'Unknown'} tone={p.health === 'ONLINE' ? 'good' : 'bad'} />
                </div>
                <FluidBar fraction={pct / 100} color={rampFor(pct)} height={8} />
                <p className="mt-1.5 font-mono text-[11.5px] text-fg3">
                  {formatBytes(p.usedBytes)} used of {formatBytes(p.sizeBytes)} · {formatBytes(p.freeBytes)}{' '}
                  free
                </p>
                {pct >= 80 && (
                  <div className="mt-2">
                    <Note
                      warn
                      text="Past 80% full, ZFS starts fragmenting writes and this pool gets slower. Worth freeing some space."
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function DisksCard({ snapshot }: { snapshot: NasSnapshot | null }) {
  const disks = snapshot?.disks ?? [];
  const failing = disks.some((d) => d.ok === false);
  const hot = disks.some((d) => (d.tempC ?? 0) >= 72);
  return (
    <Card
      title="Disks"
      trailing={
        disks.length ? (
          <Chip
            label={failing ? 'Attention' : hot ? 'Hot' : 'All well'}
            tone={failing ? 'bad' : hot ? 'warn' : 'good'}
          />
        ) : undefined
      }
    >
      {disks.length === 0 ? (
        <p className="text-[13px] text-fg3">
          {snapshot == null
            ? 'Unavailable while the NAS is off.'
            : 'Disk health could not be read just now.'}
        </p>
      ) : (
        <>
          {disks.map((d) => {
            const fail = d.ok === false;
            const isHot = (d.tempC ?? 0) >= 72;
            const warm = (d.tempC ?? 0) >= 65 && !isHot;
            return (
              <StatRow
                key={`${d.name}-${d.role}`}
                icon={fail ? <AlertTriangle size={14} /> : <Thermometer size={14} />}
                label={`${d.name ?? '?'} · ${d.role ?? 'unknown role'}`}
                value={d.tempC == null ? UNKNOWN : `${d.tempC}°C`}
                valueColor={fail || isHot ? RED : warm ? AMBER : undefined}
              />
            );
          })}
          {failing && (
            <div className="mt-2">
              <Note
                warn
                text="A disk is reporting a problem. Neither pool has a second copy, so replace it before it fails."
              />
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function ServicesCard({ snapshot }: { snapshot: NasSnapshot | null }) {
  const s = snapshot?.services;
  if (!s) {
    return (
      <Card title="Services">
        <p className="text-[13px] text-fg3">
          {snapshot == null ? 'Unavailable while the NAS is off.' : 'Service state could not be read just now.'}
        </p>
      </Card>
    );
  }
  const chip = (label: string, up: boolean | null) => (
    <Chip
      key={label}
      label={label}
      tone={up == null ? 'neutral' : up ? 'good' : 'bad'}
    />
  );
  return (
    <Card title="Services">
      <div className="flex flex-wrap gap-2">
        {chip('Jellyfin', s.jellyfin)}
        {chip('Nextcloud', s.nextcloud)}
        {chip('Caddy', s.caddy)}
        {chip('File sharing', s.smb)}
        {chip('Instant sync', s.mediaWatch)}
        <Chip
          label={s.liveTv === 'off_by_choice' ? 'Live TV off by choice' : 'Live TV on'}
          tone={s.liveTv === 'off_by_choice' ? 'neutral' : 'info'}
        />
      </div>
    </Card>
  );
}

function NowPlaying({ snapshot }: { snapshot: NasSnapshot }) {
  const playback = snapshot.playback!;
  const transcoding = playback.items.some((i) => i.method === 'Transcode');
  return (
    <Card
      title="Playing now"
      trailing={<Chip label={String(playback.count ?? playback.items.length)} tone="info" />}
    >
      {playback.items.map((item, i) => (
        <div key={`${item.title}-${i}`} className="flex items-center gap-2 py-1.5">
          {item.where === 'home' ? (
            <Home size={14} className="text-fg3" />
          ) : (
            <Server size={14} className="text-fg3" />
          )}
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">
            {item.title ?? 'Unknown title'}
          </p>
          <Chip
            label={item.method ?? 'Playing'}
            tone={item.method === 'Transcode' ? 'warn' : 'good'}
          />
        </div>
      ))}
      {transcoding && (
        <div className="mt-2">
          <Note
            warn
            text="Something is being transcoded, which is the expensive way to play a file and the usual reason CPU is high."
          />
        </div>
      )}
    </Card>
  );
}

function SystemCard({ snapshot }: { snapshot: NasSnapshot | null }) {
  const health = snapshot?.health;
  return (
    <Card
      title="System"
      trailing={
        health ? (
          <Chip
            label={`${health.stagesOk ?? 0}/${health.stagesTotal ?? 16} checks`}
            tone={health.stagesOk === health.stagesTotal ? 'good' : 'warn'}
          />
        ) : undefined
      }
    >
      <StatRow icon={<HeartPulse size={14} />} label="Uptime" value={formatDuration(snapshot?.uptimeS)} />
      <StatRow icon={<Server size={14} />} label="TrueNAS version" value={snapshot?.version ?? UNKNOWN} />
      {snapshot?.host && <StatRow icon={<Home size={14} />} label="Host" value={snapshot.host} />}
      {snapshot?.schema != null && (
        <StatRow icon={<Database size={14} />} label="Snapshot schema" value={`v${snapshot.schema}`} />
      )}
      {health && health.failing.length > 0 && (
        <div className="mt-2">
          <Note warn text={`Failing checks: ${health.failing.join(', ')}. The daily report has the detail.`} />
        </div>
      )}
    </Card>
  );
}
