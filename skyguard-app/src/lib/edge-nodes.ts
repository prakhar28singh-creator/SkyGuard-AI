/**
 * SkyGuard — Edge AI node model.
 *
 * Mirrors the on-device engine in `edge_ai/esp32/skyguard_edge.ino`. The sketch
 * prints one JSON verdict per sample over Serial:
 *   {"ts":…,"t":…,"h":…,"p":…,"score":…,"verdict":…,"root_cause":…}
 * Every threshold, weight and range below is copied from that sketch so the
 * console can never drift away from the firmware.
 *
 * This module is deliberately standalone. It does NOT touch
 *   * `imd-api.ts` — the only external API in the app (IMD weather), or
 *   * `stream.ts`  — the shared station stream consumed by Overview/StationDetail,
 * so adding the Edge AI Node panel leaves every existing API data flow intact.
 */

export type EdgeLinkState = "connected" | "simulated" | "awaiting-device" | "offline";
export type EdgeVerdict = "NORMAL" | "WARNING" | "ANOMALY";

export interface EdgeReading {
  t: number;
  h: number;
  p: number;
}

export interface EdgeLayers {
  l1: boolean;
  l2: number;
  l3: number;
  l4: boolean;
}

export interface EdgeNode {
  id: string;
  label: string;
  /** Bound weather station, or null while the node is awaiting pairing. */
  stationId: string | null;
  link: EdgeLinkState;
  fw: string;
  board: string;
  sensor: string;
  /** null = this node has never been seen (no device flashed/connected yet). */
  lastSeen: string | null;
  uptimeMs: number;
  /** EWMA/seasonal baseline the firmware learned; seeds the demo simulation. */
  baseline: EdgeReading;
  rssi: number;
  batteryPct: number;
  queueDepth: number;
  sampleIntervalMs: number;
  deepSleepSec: number;
  verdict: EdgeVerdict;
  score: number;
  rootCause: string;
  layers: EdgeLayers;
  reading: EdgeReading;
  corrected: Partial<EdgeReading>;
  /** Monotonic sample counter, used by the UI to append to the serial tail. */
  seq: number;
}

/** Values copied from edge_ai/esp32/skyguard_edge.ino (config block). */
export const EDGE_CONFIG = {
  firmware: "skyguard-edge-v1",
  tickMs: 2000,
  historyMax: 30,
  zThreshold: 2.5,
  anomalyThreshold: 0.5,
  warningThreshold: 0.3,
  fusion: { l1: 0.25, l2: 0.3, l3: 0.25, l4: 0.2 },
  range: { t: [-10, 60], h: [0, 100], p: [870, 1084] },
  i2cAddress: "0x76",
  wiring: [
    { pin: "VCC", target: "3V3" },
    { pin: "GND", target: "GND" },
    { pin: "SDA", target: "GPIO21" },
    { pin: "SCL", target: "GPIO22" },
  ],
} as const;

/** Root-cause taxonomy emitted by classify() in the sketch. */
export const EDGE_ROOT_CAUSES = [
  "COMM_LOSS / RANGE_VIOLATION",
  "STUCK_SENSOR",
  "SENSOR_FAULT",
  "SPATIAL_OUTLIER",
  "REAL_EVENT",
  "PHYSICS_CONFLICT",
  "NOMINAL",
] as const;

/** Same weighted fusion as infer() in the sketch. */
export function fuseScore(layers: EdgeLayers): number {
  let score = 0;
  if (layers.l1) score += EDGE_CONFIG.fusion.l1;
  if (layers.l2 >= EDGE_CONFIG.zThreshold) {
    score += EDGE_CONFIG.fusion.l2 * Math.min(1, layers.l2 / (EDGE_CONFIG.zThreshold + 1.5));
  }
  if (layers.l3 >= EDGE_CONFIG.zThreshold + 0.5) {
    score += EDGE_CONFIG.fusion.l3 * Math.min(1, layers.l3 / (EDGE_CONFIG.zThreshold + 2));
  }
  if (layers.l4) score += EDGE_CONFIG.fusion.l4;
  return Math.min(1, Number(score.toFixed(3)));
}

export function verdictFor(score: number): EdgeVerdict {
  if (score >= EDGE_CONFIG.anomalyThreshold) return "ANOMALY";
  if (score >= EDGE_CONFIG.warningThreshold) return "WARNING";
  return "NORMAL";
}

/**
 * Port of classify() from the sketch, evaluated in the same order.
 * The sketch currently hardcodes these arguments at its call site, so the
 * console gates the z-scores on the same thresholds the fusion layer uses.
 */
export function classifyRootCause(layers: EdgeLayers, frozen = false): string {
  if (layers.l1) return "COMM_LOSS / RANGE_VIOLATION";
  if (frozen) return "STUCK_SENSOR";
  if (layers.l2 > 0 && layers.l3 > 0) return "SENSOR_FAULT";
  if (layers.l3 > 0 && layers.l2 === 0) return "SPATIAL_OUTLIER";
  if (layers.l2 > 0 && layers.l3 === 0) return "REAL_EVENT";
  if (layers.l4) return "PHYSICS_CONFLICT";
  return "NOMINAL";
}

/** Serial line exactly as readingToJson() emits it (ts is millis() on device). */
export function firmwareJson(node: EdgeNode): string {
  return JSON.stringify({
    ts: Math.round(node.uptimeMs),
    t: Number(node.reading.t.toFixed(2)),
    h: Number(node.reading.h.toFixed(1)),
    p: Number(node.reading.p.toFixed(1)),
    score: Number(node.score.toFixed(3)),
    verdict: node.verdict,
    root_cause: node.rootCause,
  });
}

/**
 * Root cause for a reading. The fusion layer's own thresholds gate the
 * z-scores first, exactly like the sketch's classify() call site, so a nominal
 * reading never produces a fault label merely because it carries a non-zero
 * z-score. A layer that is flagged on its own (L4 physics, frozen sensor) can
 * still be labelled while the fused score stays below the alert threshold —
 * that is the firmware's real behaviour, and the card shows both.
 */
export function rootCauseFor(layers: EdgeLayers, frozen = false): string {
  const gated: EdgeLayers = {
    ...layers,
    l2: layers.l2 >= EDGE_CONFIG.zThreshold ? layers.l2 : 0,
    l3: layers.l3 >= EDGE_CONFIG.zThreshold + 0.5 ? layers.l3 : 0,
  };
  return classifyRootCause(gated, frozen);
}

/* ------------------------------------------------------------------ *
 * Demo seed + simulation
 *
 * No ESP32 has to be connected for this page to work. `edgeStream` ticks
 * locally at the firmware's own sampling interval and walks each simulated
 * node through the full root-cause taxonomy, so the panel is populated the
 * instant the app opens. Nodes marked "awaiting-device" never advance: they
 * stay honestly blank until real hardware is flashed and paired.
 * ------------------------------------------------------------------ */

type Fault =
  | "NOMINAL"
  | "PHYSICS_CONFLICT"
  | "STUCK_SENSOR"
  | "REAL_EVENT"
  | "SPATIAL_OUTLIER"
  | "SENSOR_FAULT"
  | "COMM_LOSS / RANGE_VIOLATION";

const CYCLE = 48;

/** Deterministic per-node phase so node waves never line up. */
function hashPhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 997;
  return h / 97;
}

/** Fault walked at a slot of the 48-tick cycle (48 x 2 s = 96 s per lap). */
function faultSlots(slot: number): Fault {
  if (slot >= 46) return "COMM_LOSS / RANGE_VIOLATION";
  if (slot >= 43) return "SENSOR_FAULT";
  if (slot >= 39) return "SPATIAL_OUTLIER";
  if (slot >= 34) return "REAL_EVENT";
  if (slot >= 29) return "STUCK_SENSOR";
  if (slot >= 24) return "PHYSICS_CONFLICT";
  return "NOMINAL";
}

/**
 * Layer values for each fault window.
 *
 * Note on magnitudes: with the sketch's fusion weights a single layer can add
 * at most 0.30 (exactly the WARNING threshold), so a single-layer fault can
 * never cross ANOMALY >= 0.50. Each window therefore combines layers the way a
 * genuine fault does — a range violation is also a large temporal deviation, a
 * stuck sensor also breaks the physics layer.
 */
function layersFor(fault: Fault, wave: number): EdgeLayers {
  const { zThreshold } = EDGE_CONFIG;
  switch (fault) {
    case "COMM_LOSS / RANGE_VIOLATION":
      return { l1: true, l2: zThreshold + 1.7, l3: 0.5, l4: false };
    case "SENSOR_FAULT":
      return { l1: false, l2: zThreshold + 1.5, l3: zThreshold + 2, l4: true };
    case "SPATIAL_OUTLIER":
      return { l1: false, l2: 0.5, l3: zThreshold + 2, l4: true };
    case "REAL_EVENT":
      return { l1: false, l2: zThreshold + 1.5, l3: 0.5, l4: false };
    case "STUCK_SENSOR":
      return { l1: false, l2: zThreshold + 0.1, l3: 0.4, l4: true };
    case "PHYSICS_CONFLICT":
      return { l1: false, l2: 0.5, l3: 0.5, l4: true };
    default:
      return { l1: false, l2: Number((0.4 + wave * 0.8).toFixed(2)), l3: 0.5, l4: false };
  }
}

/** One sampling interval for a simulated or connected node. */
function advance(node: EdgeNode, tick: number): EdgeNode {
  if (node.link === "awaiting-device" || node.link === "offline") return node;

  const phase = tick / 3 + hashPhase(node.id);
  const wave = Math.sin(phase);
  const fault = faultSlots(tick % CYCLE);
  const layers = layersFor(fault, wave);
  const frozen = fault === "STUCK_SENSOR";

  const jump =
    fault === "COMM_LOSS / RANGE_VIOLATION" ? 14.6 :
    fault === "REAL_EVENT" || fault === "SENSOR_FAULT" ? 3.4 :
    0;

  const reading: EdgeReading = {
    t: frozen
      ? Number(node.baseline.t.toFixed(2))
      : Number((node.baseline.t + wave * 0.8 + jump).toFixed(2)),
    h: frozen
      ? Number(node.baseline.h.toFixed(1))
      : Number((node.baseline.h + Math.cos(phase / 1.4) * 2.1).toFixed(1)),
    p: Number(
      (node.baseline.p + Math.sin(phase / 2.2) * 0.6 - (fault === "PHYSICS_CONFLICT" ? 5.6 : 0)).toFixed(1)
    ),
  };

  const score = fuseScore(layers);
  const verdict = verdictFor(score);
  const rootCause = rootCauseFor(layers, frozen);

  const corrected: Partial<EdgeReading> =
    verdict === "ANOMALY"
      ? {
          ...(Math.abs(reading.t - node.baseline.t) > 1.5 ? { t: Number(node.baseline.t.toFixed(2)) } : {}),
          ...(Math.abs(reading.h - node.baseline.h) > 4 ? { h: Number(node.baseline.h.toFixed(1)) } : {}),
          ...(Math.abs(reading.p - node.baseline.p) > 3 ? { p: Number(node.baseline.p.toFixed(1)) } : {}),
        }
      : {};

  return {
    ...node,
    lastSeen: new Date().toISOString(),
    uptimeMs: node.uptimeMs + EDGE_CONFIG.tickMs,
    reading,
    layers,
    score,
    verdict,
    rootCause,
    corrected,
    seq: node.seq + 1,
    queueDepth:
      verdict === "NORMAL"
        ? Math.max(0, node.queueDepth - 1)
        : Math.min(24, node.queueDepth + 1),
    batteryPct: Math.max(18, Number((node.batteryPct - 0.01).toFixed(2))),
    rssi: Math.round(-61 + Math.sin(phase / 1.7) * 4),
  };
}

interface EdgeSeed {
  id: string;
  label: string;
  stationId: string | null;
  link: EdgeLinkState;
  baseline: EdgeReading;
  batteryPct: number;
  deepSleepSec: number;
}

const EDGE_SEEDS: EdgeSeed[] = [
  {
    id: "EDGE-01",
    label: "Rooftop AWS sensor node",
    stationId: "MH-042",
    link: "simulated",
    baseline: { t: 29.4, h: 74.2, p: 1008.4 },
    batteryPct: 92,
    deepSleepSec: 0,
  },
  {
    id: "EDGE-02",
    label: "Solar field station node",
    stationId: "RJ-018",
    link: "simulated",
    baseline: { t: 32.1, h: 58.6, p: 1004.2 },
    batteryPct: 78,
    deepSleepSec: 300,
  },
  {
    id: "EDGE-03",
    label: "Spare node — not flashed yet",
    stationId: null,
    link: "awaiting-device",
    baseline: { t: 0, h: 0, p: 0 },
    batteryPct: 0,
    deepSleepSec: 0,
  },
];

export function createEdgeNodes(): EdgeNode[] {
  return EDGE_SEEDS.map((seed) => {
    const awaiting = seed.link === "awaiting-device";
    const layers: EdgeLayers = awaiting
      ? { l1: false, l2: 0, l3: 0, l4: false }
      : { l1: false, l2: 0.6, l3: 0.5, l4: false };
    const score = awaiting ? 0 : fuseScore(layers);
    const verdict: EdgeVerdict = awaiting ? "NORMAL" : verdictFor(score);
    return {
      id: seed.id,
      label: seed.label,
      stationId: seed.stationId,
      link: seed.link,
      fw: EDGE_CONFIG.firmware,
      board: "ESP32 Dev Module",
      sensor: `BME280 @ ${EDGE_CONFIG.i2cAddress}`,
      lastSeen: null,
      uptimeMs: 0,
      baseline: seed.baseline,
      rssi: awaiting ? 0 : -61,
      batteryPct: seed.batteryPct,
      queueDepth: 0,
      sampleIntervalMs: EDGE_CONFIG.tickMs,
      deepSleepSec: seed.deepSleepSec,
      verdict,
      score,
      rootCause: rootCauseFor(layers),
      layers,
      reading: seed.baseline,
      corrected: {},
      seq: 0,
    };
  });
}

type EdgeListener = (nodes: EdgeNode[]) => void;

/**
 * Local edge telemetry stream. Intentionally separate from the shared
 * `streamService` in `stream.ts`, so the station-stream payload consumed by
 * Overview and StationDetail is never altered by this feature.
 */
class EdgeStreamService {
  private listeners: EdgeListener[] = [];
  private interval: number | null = null;
  private running = false;
  private tick = 0;
  private nodes: EdgeNode[] = createEdgeNodes();

  /** Synchronous snapshot, so the panel paints on the very first render. */
  getSnapshot(): EdgeNode[] {
    return this.nodes;
  }

  subscribe(listener: EdgeListener) {
    this.listeners.push(listener);
    listener(this.nodes);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.interval = window.setInterval(() => this.step(), EDGE_CONFIG.tickMs);
  }

  stop() {
    if (this.interval !== null) {
      window.clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
  }

  private step() {
    this.tick += 1;
    this.nodes = this.nodes.map((node) => advance(node, this.tick));
    this.listeners.forEach((listener) => listener(this.nodes));
  }
}

export const edgeStream = new EdgeStreamService();




