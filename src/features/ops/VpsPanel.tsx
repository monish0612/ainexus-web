import {
  Cloud,
  Cpu,
  Globe,
  MemoryStick,
  Receipt,
  Server,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import type { LiveSample } from './live';
import { spotsForMetric } from './live';
import { AMBER, RED, Banner, Card, Chip, Note, Shroud, StatRow } from './chrome';
import { FluidGauge, LiveSparkline } from './gauges';
import { UNKNOWN, formatAgo, formatDueDate, formatDuration, formatGb, planSpec, priceLabel, relativeDays } from './format';
import type { NasStatsEnvelope, StatMetric, VpsBilling, VpsLive } from '@/lib/api/stats';

export function VpsPanel({
  env,
  live,
  wide,
  unreachable,
  onOpen,
}: {
  env: NasStatsEnvelope;
  live: LiveSample[];
  wide: boolean;
  unreachable: boolean;
  onOpen: (m: StatMetric) => void;
}) {
  const vps = env.vpsLive;
  const billing = vps?.billing;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {billing && (billing.vps || billing.others.length > 0) && (
        <SubscriptionCard billing={billing} vps={vps} />
      )}
      <Shroud offline={unreachable}>
        <div className="grid gap-4 lg:grid-cols-2 lg:col-span-2">
          {vps?.throttled && !unreachable && <ThrottleWarning />}
          <ResourcesCard vps={vps} offline={unreachable} live={live} wide={wide} onOpen={onOpen} />
          <LoadCard vps={vps} offline={unreachable} live={live} wide={wide} onOpen={onOpen} />
          <PlatformCard vps={vps} nasOnline={env.online} offline={unreachable} />
        </div>
      </Shroud>
    </div>
  );
}

function ThrottleWarning() {
  return (
    <div className="lg:col-span-2">
      <Banner
        fault
        title="Hostinger is throttling this VPS"
        message="Sustained high CPU has triggered a limit. If it continues, the machine can be stopped — which takes the websites and remote access with it."
      />
    </div>
  );
}

function ResourcesCard({
  vps,
  offline,
  live,
  wide,
  onOpen,
}: {
  vps: VpsLive | null | undefined;
  offline: boolean;
  live: LiveSample[];
  wide: boolean;
  onOpen: (m: StatMetric) => void;
}) {
  const val = (x: number | null | undefined) => (offline ? 0 : (x ?? null));
  return (
    <Card title="Resources" className="lg:col-span-2">
      <div className="flex flex-wrap justify-around gap-3">
        {(
          [
            ['vpsCpu', 'CPU', val(vps?.cpuPct), vps?.cores == null ? null : `${vps.cores} vCPU`, (vps?.cpuPct ?? 100) < 10 ? 1 : 0],
            ['vpsRam', 'RAM', val(vps?.memPct), vps?.memTotalGb == null ? null : `${formatGb(vps.memFreeGb)} free`, 1],
            ['vpsDisk', 'DISK', val(vps?.diskPct), vps?.diskTotalGb == null ? null : `${formatGb(vps.diskFreeGb)} free`, 1],
          ] as const
        ).map(([metric, label, value, subtitle, decimals]) => (
          <div key={metric} className="flex min-w-[140px] flex-1 flex-col items-center">
            <FluidGauge
              value={value}
              label={label}
              subtitle={subtitle}
              decimals={decimals}
              onClick={() => onOpen(metric)}
            />
            {wide && (
              <div className="mt-2 w-full">
                <LiveSparkline spots={spotsForMetric(live, metric)} height={72} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function LoadCard({
  vps,
  offline,
  live,
  wide,
  onOpen,
}: {
  vps: VpsLive | null | undefined;
  offline: boolean;
  live: LiveSample[];
  wide: boolean;
  onOpen: (m: StatMetric) => void;
}) {
  const n = (v: number | null | undefined) => (v == null ? UNKNOWN : v.toFixed(2));
  const stealHigh = (vps?.stealPct ?? 0) >= 20;
  return (
    <Card title="Load and steal">
      <div className="flex flex-col items-center">
        <FluidGauge
          value={offline ? 0 : (vps?.stealPct ?? null)}
          label="STEAL"
          decimals={1}
          color={stealHigh ? RED : undefined}
          subtitle={vps?.stealPct == null ? 'via NAS' : null}
          onClick={() => onOpen('vpsSteal')}
        />
        {wide && (
          <div className="mt-2 w-full">
            <LiveSparkline spots={spotsForMetric(live, 'vpsSteal')} height={80} />
          </div>
        )}
      </div>
      <div className="mt-3 border-t border-line pt-2">
        <StatRow
          icon={<Cpu size={14} />}
          label="Load average (1 / 5 / 15 min)"
          value={vps == null || offline ? UNKNOWN : `${n(vps.load1)} · ${n(vps.load5)} · ${n(vps.load15)}`}
        />
        <StatRow
          icon={<Timer size={14} />}
          label="Uptime"
          value={offline ? UNKNOWN : formatDuration(vps?.uptimeS)}
        />
      </div>
      {stealHigh && !offline && (
        <div className="mt-3">
          <Note
            warn
            text="Steal above 20% means the host is holding this machine back. This is not something the server can fix itself."
          />
        </div>
      )}
    </Card>
  );
}

function SubscriptionCard({ billing, vps }: { billing: VpsBilling; vps: VpsLive | null | undefined }) {
  const sub = billing.vps;
  const attention =
    sub?.daysLeft != null && (sub.daysLeft < 0 || (sub.dueKind === 'expires' && sub.daysLeft <= 30));
  const statusTone =
    sub?.status === 'active' ? 'good' : sub?.status === 'non_renewing' || sub?.status === 'pending' ? 'warn' : 'bad';
  const spec = planSpec(vps?.vcpus ?? null, vps?.planRamMb ?? null, vps?.planDiskMb ?? null);
  const verb = sub?.dueKind === 'renews' ? 'Renews' : sub?.dueKind === 'expires' ? 'Expires' : null;
  const price = sub ? priceLabel(sub) : null;
  return (
    <Card
      title="Subscription"
      className="lg:col-span-2"
      trailing={
        sub?.status ? (
          <Chip label={sub.status.replaceAll('_', ' ')} tone={statusTone} icon={<Receipt size={12} />} />
        ) : undefined
      }
    >
      {verb && (
        <div className="mb-3">
          <p className="text-lg font-extrabold tabular-nums text-fg">
            {verb} {formatDueDate(sub?.dueAt)}
          </p>
          {sub?.daysLeft != null && (
            <p className={`text-[12px] font-semibold ${attention ? 'text-amber-400' : 'text-fg3'}`}>
              {relativeDays(sub.daysLeft, sub.dueKind === 'expires')}
            </p>
          )}
        </div>
      )}
      <StatRow icon={<Server size={14} />} label="Plan" value={vps?.planName ?? sub?.name ?? UNKNOWN} />
      {spec && <StatRow icon={<MemoryStick size={14} />} label="Allocated" value={spec} />}
      {price && (
        <StatRow
          icon={<Receipt size={14} />}
          label={sub?.dueKind === 'expires' ? 'Renewal price' : 'Billed'}
          value={price}
        />
      )}
      {sub?.autoRenew != null && (
        <StatRow
          icon={<ShieldCheck size={14} />}
          label="Auto-renew"
          value={sub.autoRenew ? 'On' : 'Off'}
          valueColor={sub.autoRenew ? undefined : AMBER}
        />
      )}
      {billing.others.map((other) =>
        other.dueKind === 'renews' || other.dueKind === 'expires' ? (
          <StatRow
            key={other.name ?? other.dueAt ?? 'other'}
            icon={<Globe size={14} />}
            label={other.name ?? 'Other subscription'}
            value={`${other.dueKind === 'renews' ? 'Renews' : 'Expires'} ${formatDueDate(other.dueAt)}`}
            valueColor={
              other.daysLeft != null && other.dueKind === 'expires' && other.daysLeft <= 30 ? AMBER : undefined
            }
          />
        ) : null,
      )}
      <div className="mt-3">
        {billing.error ? (
          <Note
            warn
            text={`The last billing lookup failed (${billing.error}), so this may be out of date. It is retried twice a day.`}
          />
        ) : billing.fromCache ? (
          <Note
            text={`Remembered from ${formatAgo(billing.ageS)} — your NAS relays this and is currently off. Renewal dates move once a month, so it is almost certainly still right.`}
          />
        ) : !sub ? (
          <Note text="No subscription for this machine was found on the account." />
        ) : (
          <Note text={`Checked ${formatAgo(billing.ageS)}. Billing is read twice a day, not continuously.`} />
        )}
      </div>
    </Card>
  );
}

function PlatformCard({
  vps,
  nasOnline,
  offline,
}: {
  vps: VpsLive | null | undefined;
  nasOnline: boolean;
  offline: boolean;
}) {
  const degraded =
    vps?.containers != null && vps.running != null && vps.running < vps.containers;
  return (
    <Card
      title="Platform"
      trailing={
        offline ? (
          <Chip label="not responding" tone="bad" icon={<Cloud size={12} />} />
        ) : vps?.state ? (
          <Chip
            label={vps.state}
            tone={vps.state === 'running' ? 'good' : 'warn'}
            icon={<Cloud size={12} />}
          />
        ) : undefined
      }
    >
      <StatRow
        icon={<Server size={14} />}
        label="Containers running"
        value={vps?.containers == null ? UNKNOWN : `${vps.running ?? 0} of ${vps.containers}`}
        valueColor={degraded ? AMBER : undefined}
      />
      <StatRow
        icon={<ShieldCheck size={14} />}
        label="Reported by"
        value={
          vps?.stateFrom === 'hostinger'
            ? 'Hostinger API'
            : vps?.stateFrom === 'probe'
              ? 'Our own probes'
              : UNKNOWN
        }
      />
      {vps?.hostname && <StatRow icon={<Globe size={14} />} label="Hostname" value={vps.hostname} />}
      {(vps?.conditions ?? []).length > 0 && (
        <StatRow
          icon={<Cloud size={14} />}
          label="Conditions"
          value={vps!.conditions.join(', ')}
          valueColor={AMBER}
        />
      )}
      <div className="mt-3">
        {offline ? (
          <Note text="These are the last figures received. Nothing here is live while the VPS is not answering." />
        ) : !nasOnline ? (
          <Note text="Steal, throttling and the container count come from your NAS, which is currently off. Everything above is measured on the VPS itself and is live." />
        ) : vps?.stale ? (
          <Note
            text={`These platform figures are ${formatAgo(vps.ageS)} — they are collected every five minutes, not continuously.`}
          />
        ) : (
          <Note
            text={`Platform figures refresh every five minutes (${formatAgo(vps?.ageS)}). CPU, memory and disk above are live.`}
          />
        )}
      </div>
      {degraded && (
        <p className="mt-2 text-[12px] font-semibold text-amber-400">Some containers are not running.</p>
      )}
    </Card>
  );
}
