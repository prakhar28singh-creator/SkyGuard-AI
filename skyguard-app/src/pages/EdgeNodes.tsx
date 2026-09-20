import { type ElementType, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BatteryMedium,
  CircuitBoard,
  Clock,
  Cpu,
  Droplets,
  Gauge,
  HardDrive,
  Info,
  Layers,
  Moon,
  Radio,
  Server,
  ShieldAlert,
  Signal,
  Terminal,
  Thermometer,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getStationById } from "@/lib/mock-data";
import {
  EDGE_CONFIG,
  EDGE_ROOT_CAUSES,
  edgeStream,
  firmwareJson,
  type EdgeLinkState,
  type EdgeNode,
  type EdgeVerdict,
} from "@/lib/edge-nodes";

const LINK_META: Record<EdgeLinkState, { label: string; icon: ElementType; pill: string; note: string }> = {
  connected: {
    label: "Linked",
    icon: Wifi,
    pill: "bg-healthy-green/15 text-healthy-green",
    note: "Live hardware streaming on-device verdicts.",
  },
  simulated: {
    label: "Simulated",
    icon: Wifi,
    pill: "bg-sky-blue/20 text-graphite",
    note: "No device attached — the on-device engine is replayed locally.",
  },
  "awaiting-device": {
    label: "Awaiting device",
    icon: WifiOff,
    pill: "bg-cloud-grey/70 text-graphite",
    note: "Waiting for firmware to be flashed and paired.",
  },
  offline: {
    label: "Offline",
    icon: WifiOff,
    pill: "bg-alert-coral/15 text-alert-coral",
    note: "No samples inside the keep-alive window.",
  },
};

const VERDICT_META: Record<EdgeVerdict, { pill: string; icon: ElementType }> = {
  NORMAL: { pill: "bg-healthy-green/15 text-healthy-green", icon: Activity },
  WARNING: { pill: "bg-signal-amber/20 text-signal-amber", icon: AlertTriangle },
  ANOMALY: { pill: "bg-alert-coral/15 text-alert-coral", icon: ShieldAlert },
};

const ACTION_BY_CAUSE: Record<string, string> = {
  "COMM_LOSS / RANGE_VIOLATION": "Power-cycle the node and verify the BME280 wiring and uplink.",
  STUCK_SENSOR: "Replace or reseat the sensor — the reading has been frozen for 8+ samples.",
  SENSOR_FAULT: "Recalibrate against a reference — the temporal and spatial layers both disagree.",
  SPATIAL_OUTLIER: "Cross-check neighbouring stations before dispatching a technician.",
  REAL_EVENT: "Likely a genuine weather event — keep the corrected value and monitor.",
  PHYSICS_CONFLICT: "Inspect the sensor: dewpoint and pressure are physically inconsistent.",
  NOMINAL: "No action required.",
};

function formatUptime(ms: number): string {
  if (ms <= 0) return "—";
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function reading(node: EdgeNode, key: "t" | "h" | "p", digits: number, suffix: string): string {
  if (node.link === "awaiting-device") return "—";
  return `${node.reading[key].toFixed(digits)}${suffix}`;
}

function StatTile({ icon: Icon, label, value }: { icon: ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-graphite/50" />
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-graphite/50">{label}</p>
        <p className="truncate text-xs font-semibold text-ink-navy">{value}</p>
      </div>
    </div>
  );
}

function LayerBar({
  name,
  value,
  percent,
  triggered,
  tint,
}: {
  name: string;
  value: string;
  percent: number;
  triggered: boolean;
  tint: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-graphite/70">{name}</span>
        <span className={triggered ? "font-semibold text-alert-coral" : "font-semibold text-graphite/50"}>
          {value}
        </span>
      </div>
      <Progress className="mt-1 h-2" value={percent} indicatorClassName={tint} />
    </div>
  );
}

function NodeCard({ node }: { node: EdgeNode }) {
  const link = LINK_META[node.link];
  const verdict = VERDICT_META[node.verdict];
  const LinkIcon = link.icon;
  const VerdictIcon = verdict.icon;
  const station = node.stationId ? getStationById(node.stationId) : undefined;
  const awaiting = node.link === "awaiting-device";

  const correctedParts = [
    node.corrected.t !== undefined ? `${node.corrected.t.toFixed(2)} °C` : null,
    node.corrected.h !== undefined ? `${node.corrected.h.toFixed(1)} %` : null,
    node.corrected.p !== undefined ? `${node.corrected.p.toFixed(1)} hPa` : null,
  ].filter((part): part is string => part !== null);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-deep-atmo text-white">
            <Cpu className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-ink-navy">{node.id}</h2>
            <p className="text-xs text-graphite/60">{node.label}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${link.pill}`}
          >
            <LinkIcon className="h-3 w-3" /> {link.label}
          </span>
          {!awaiting && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${verdict.pill}`}
            >
              <VerdictIcon className="h-3 w-3" /> {node.verdict}
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-graphite/70">
        <Info className="mr-1 inline h-3 w-3 align-[-1px]" />
        {link.note}
        {awaiting && " Flash edge_ai/esp32/skyguard_edge.ino and pair it to replace this placeholder."}
      </p>

      {awaiting ? (
        <div className="mt-4 space-y-1.5 rounded-xl border border-dashed border-cloud-grey bg-slate-50/60 p-4">
          <p className="text-sm font-semibold text-graphite">No samples received yet</p>
          <p className="text-xs text-graphite/70">
            This node is registered in the fleet but has never reported. It turns live the moment the
            ESP32 boots and emits its first verdict.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-graphite/50">
                Fused on-device score
              </p>
              <p className="text-2xl font-bold leading-none text-ink-navy">{node.score.toFixed(2)}</p>
            </div>
            <div className="text-right text-[11px] text-graphite/60">
              <p>ANOMALY ≥ {EDGE_CONFIG.anomalyThreshold.toFixed(2)}</p>
              <p>WARNING ≥ {EDGE_CONFIG.warningThreshold.toFixed(2)}</p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <StatTile icon={Thermometer} label="Temperature" value={reading(node, "t", 2, " °C")} />
            <StatTile icon={Droplets} label="Humidity" value={reading(node, "h", 1, " %")} />
            <StatTile icon={Gauge} label="Pressure" value={reading(node, "p", 1, " hPa")} />
          </div>

          <div className="mt-4 space-y-2.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-graphite">
              <Layers className="h-3.5 w-3.5" /> Layer contributions
            </p>
            <LayerBar
              name="L1 physical plausibility"
              value={node.layers.l1 ? "range violation" : "ok"}
              percent={node.layers.l1 ? 100 : 0}
              triggered={node.layers.l1}
              tint="bg-alert-coral"
            />
            <LayerBar
              name="L2 temporal (z-score)"
              value={node.layers.l2.toFixed(2)}
              percent={Math.min(100, (node.layers.l2 / 6) * 100)}
              triggered={node.layers.l2 >= EDGE_CONFIG.zThreshold}
              tint="bg-signal-amber"
            />
            <LayerBar
              name="L3 spatial (z-score)"
              value={node.layers.l3.toFixed(2)}
              percent={Math.min(100, (node.layers.l3 / 6) * 100)}
              triggered={node.layers.l3 >= EDGE_CONFIG.zThreshold + 0.5}
              tint="bg-sky-blue"
            />
            <LayerBar
              name="L4 multivariate physics"
              value={node.layers.l4 ? "flagged" : "ok"}
              percent={node.layers.l4 ? 100 : 0}
              triggered={node.layers.l4}
              tint="bg-violet"
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-100 px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-graphite/50">Root cause</p>
              <p className="text-sm font-semibold text-ink-navy">{node.rootCause}</p>
              <p className="mt-1 text-[11px] text-graphite/70">{ACTION_BY_CAUSE[node.rootCause]}</p>
            </div>
            <div className="rounded-xl border border-slate-100 px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-graphite/50">
                Corrected value (self-healing)
              </p>
              <p className="text-sm font-semibold text-ink-navy">
                {correctedParts.length > 0 ? correctedParts.join(" · ") : "Nothing imputed — reading trusted"}
              </p>
              <p className="mt-1 text-[11px] text-graphite/70">
                Baseline: {node.baseline.t.toFixed(1)} °C · {node.baseline.h.toFixed(0)} % ·{" "}
                {node.baseline.p.toFixed(0)} hPa
              </p>
            </div>
          </div>
        </>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile icon={HardDrive} label="Firmware" value={node.fw} />
        <StatTile icon={CircuitBoard} label="Board · sensor" value={`${node.board} · ${node.sensor}`} />
        <StatTile
          icon={Radio}
          label="Bound station"
          value={station ? `${station.id} · ${station.name}` : "Unpaired"}
        />
        <StatTile
          icon={Clock}
          label="Last sample · uptime"
          value={`${formatLastSeen(node.lastSeen)} · ${formatUptime(node.uptimeMs)}`}
        />
        <StatTile icon={Signal} label="Signal" value={awaiting ? "—" : `${node.rssi} dBm`} />
        <StatTile icon={BatteryMedium} label="Battery" value={awaiting ? "—" : `${node.batteryPct.toFixed(1)} %`} />
        <StatTile icon={Server} label="Queued verdicts" value={`${node.queueDepth}`} />
        <StatTile
          icon={Zap}
          label="Sample interval"
          value={`${node.sampleIntervalMs} ms · window ${EDGE_CONFIG.historyMax}`}
        />
        <StatTile
          icon={Moon}
          label="Deep sleep"
          value={node.deepSleepSec > 0 ? `${node.deepSleepSec} s between samples` : "Disabled (always-on)"}
        />
      </div>
    </Card>
  );
}

interface SerialLine {
  key: string;
  at: string;
  json: string;
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tint,
}: {
  icon: ElementType;
  label: string;
  value: string | number;
  hint: string;
  tint: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-graphite/50">{label}</p>
        <Icon className={`h-4 w-4 ${tint}`} />
      </div>
      <p className="mt-2 text-2xl font-bold leading-none text-ink-navy">{value}</p>
      <p className="mt-1 text-[11px] text-graphite/60">{hint}</p>
    </Card>
  );
}

function SerialMonitor({ lines }: { lines: SerialLine[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cloud-grey px-5 py-3">
        <h3 className="flex items-center gap-2 font-serif text-lg font-semibold text-ink-navy">
          <Terminal className="h-4 w-4 text-graphite/60" /> Serial monitor · 115200 baud
        </h3>
        <span className="text-[11px] text-graphite/50">{lines.length} recent verdicts</span>
      </div>
      <div className="max-h-[300px] overflow-y-auto bg-ink-navy p-4 font-mono text-[11px] leading-relaxed text-sky-blue">
        {lines.length === 0 ? (
          <p className="text-ink-soft">Waiting for the first verdict from an edge node…</p>
        ) : (
          lines.map((line) => (
            <p key={line.key} className="whitespace-pre-wrap break-all">
              <span className="text-ink-soft">{line.at} </span>
              {line.json}
            </p>
          ))
        )}
      </div>
    </Card>
  );
}

export function EdgeNodes() {
  const [nodes, setNodes] = useState<EdgeNode[]>(() => edgeStream.getSnapshot());
  const [lines, setLines] = useState<SerialLine[]>([]);
  const seenRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const unsubscribe = edgeStream.subscribe((next) => {
      const stamp = new Date().toLocaleTimeString("en-IN", { hour12: false });
      const fresh: SerialLine[] = [];
      next.forEach((node) => {
        if (node.link === "awaiting-device") return;
        if (seenRef.current[node.id] === node.seq) return;
        seenRef.current[node.id] = node.seq;
        fresh.push({
          key: `${node.id}-${node.seq}`,
          at: stamp,
          json: `${node.id} ${firmwareJson(node)}`,
        });
      });
      if (fresh.length > 0) {
        setLines((current) => [...fresh.reverse(), ...current].slice(0, 12));
      }
      setNodes(next);
    });
    edgeStream.start();
    return unsubscribe;
  }, []);

  const totals = useMemo(() => {
    const reporting = nodes.filter((node) => node.link !== "awaiting-device" && node.link !== "offline");
    return {
      linked: nodes.filter((node) => node.link === "connected").length,
      simulated: nodes.filter((node) => node.link === "simulated").length,
      awaiting: nodes.filter((node) => node.link === "awaiting-device").length,
      anomalies: reporting.filter((node) => node.verdict === "ANOMALY").length,
      warnings: reporting.filter((node) => node.verdict === "WARNING").length,
      queued: reporting.reduce((sum, node) => sum + node.queueDepth, 0),
      battery:
        reporting.length > 0
          ? reporting.reduce((sum, node) => sum + node.batteryPct, 0) / reporting.length
          : 0,
    };
  }, [nodes]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-ink-navy">Edge AI Node</h1>
        <p className="mt-1 text-sm text-graphite/70">
          On-device anomaly detection for remote AWS stations — L1–L4 verdicts produced at the sensor,
          before the uplink, so bad data never reaches the gateway.
        </p>
      </div>

      {totals.linked === 0 && (
        <Card className="border-signal-amber/40 bg-signal-amber/10 p-4">
          <div className="flex gap-3">
            <CircuitBoard className="mt-0.5 h-5 w-5 shrink-0 text-signal-amber" />
            <div className="text-sm">
              <p className="font-semibold text-ink-navy">No ESP32 linked right now</p>
              <p className="mt-1 text-graphite/80">
                {totals.simulated} node{totals.simulated === 1 ? "" : "s"} are replaying the firmware
                engine locally, so this panel is populated the moment the app opens, and {totals.awaiting}{" "}
                node is registered awaiting its first boot. Flash{" "}
                <span className="font-mono text-xs">edge_ai/esp32/skyguard_edge.ino</span> and pair it to
                switch this panel over to live hardware.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={Cpu}
          label="Nodes registered"
          value={nodes.length}
          hint={`${totals.simulated} simulated · ${totals.awaiting} awaiting device`}
          tint="text-deep-atmo"
        />
        <Kpi
          icon={Wifi}
          label="Devices linked"
          value={totals.linked}
          hint={totals.linked === 0 ? "None attached yet" : "Live hardware streaming"}
          tint="text-healthy-green"
        />
        <Kpi
          icon={ShieldAlert}
          label="On-device anomalies"
          value={totals.anomalies}
          hint={`${totals.warnings} warning · ${totals.queued} verdicts queued`}
          tint="text-alert-coral"
        />
        <Kpi
          icon={BatteryMedium}
          label="Avg battery"
          value={`${totals.battery.toFixed(0)}%`}
          hint="Solar / battery field nodes"
          tint="text-signal-amber"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {nodes.map((node) => (
          <NodeCard key={node.id} node={node} />
        ))}
      </div>

      <SerialMonitor lines={lines} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="flex items-center gap-2 font-serif text-lg font-semibold text-ink-navy">
            <Zap className="h-4 w-4 text-graphite/60" /> On-device engine
          </h3>
          <p className="mt-1 text-sm text-graphite/70">
            Every value below is read from <span className="font-mono text-xs">EDGE_CONFIG</span>, which
            mirrors the sketch — the console cannot drift from the firmware.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <StatTile
              icon={ShieldAlert}
              label="ANOMALY / WARNING"
              value={`${EDGE_CONFIG.anomalyThreshold.toFixed(2)} / ${EDGE_CONFIG.warningThreshold.toFixed(2)}`}
            />
            <StatTile icon={Activity} label="Z-score threshold" value={`${EDGE_CONFIG.zThreshold}`} />
            <StatTile
              icon={Layers}
              label="Fusion weights"
              value={`L1 ${EDGE_CONFIG.fusion.l1} · L2 ${EDGE_CONFIG.fusion.l2} · L3 ${EDGE_CONFIG.fusion.l3} · L4 ${EDGE_CONFIG.fusion.l4}`}
            />
            <StatTile
              icon={Zap}
              label="Sampling"
              value={`${EDGE_CONFIG.tickMs} ms · window ${EDGE_CONFIG.historyMax}`}
            />
            <StatTile
              icon={Thermometer}
              label="Temperature range"
              value={`${EDGE_CONFIG.range.t[0]} … ${EDGE_CONFIG.range.t[1]} °C`}
            />
            <StatTile
              icon={Droplets}
              label="Humidity range"
              value={`${EDGE_CONFIG.range.h[0]} … ${EDGE_CONFIG.range.h[1]} %`}
            />
            <StatTile
              icon={Gauge}
              label="Pressure range"
              value={`${EDGE_CONFIG.range.p[0]} … ${EDGE_CONFIG.range.p[1]} hPa`}
            />
            <StatTile icon={Server} label="Memory footprint" value="O(1) · ~10 floats per station" />
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="flex items-center gap-2 font-serif text-lg font-semibold text-ink-navy">
            <CircuitBoard className="h-4 w-4 text-graphite/60" /> Wiring · BME280 → ESP32
          </h3>
          <p className="mt-1 text-sm text-graphite/70">
            I2C sensor on {EDGE_CONFIG.i2cAddress}, sampled every {EDGE_CONFIG.tickMs} ms.
          </p>
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sensor pin</TableHead>
                  <TableHead>ESP32</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {EDGE_CONFIG.wiring.map((row) => (
                  <TableRow key={row.pin}>
                    <TableCell className="font-medium text-ink-navy">{row.pin}</TableCell>
                    <TableCell className="text-graphite/70">{row.target}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-[11px] text-graphite/60">
            {EDGE_CONFIG.firmware} · Serial 115200 baud · deep sleep optional
          </p>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h3 className="flex items-center gap-2 font-serif text-lg font-semibold text-ink-navy">
            <Layers className="h-4 w-4 text-graphite/60" /> Root-cause taxonomy ·{" "}
            {EDGE_ROOT_CAUSES.length} classes
          </h3>
          <p className="mt-1 text-sm text-graphite/70">
            The on-device classifier labels every verdict so an operator receives an answer, not just a
            score. The simulated nodes walk through all of these while the page is open.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {EDGE_ROOT_CAUSES.map((cause) => (
              <div key={cause} className="rounded-xl border border-slate-100 px-3 py-2">
                <p className="font-mono text-xs font-semibold text-ink-navy">{cause}</p>
                <p className="mt-1 text-[11px] text-graphite/70">{ACTION_BY_CAUSE[cause]}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

