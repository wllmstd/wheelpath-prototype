/* Three MADE-UP sample areas for the prototype. Street names, places, measurements and barriers are
   all invented for demonstration. They are not real places and not survey data. */
import { makeProjection, segProject } from '@/lib/engine/geo';
import { HAZARD_TYPES } from '@/lib/engine/rules';
import type { Curb, EdgeKind, GEdge, GNode, Hazard, HazardType, LngLat, Network, Place, PlaceCat, Report, Severity, Surface } from '@/lib/engine/types';

type XY = [number, number];
interface EdgeAttr { width?: number; slope?: number; surface?: Surface; kind?: EdgeKind; name?: string }
interface AreaDef {
  id: string; name: string; blurb: string;
  xs: number[]; ys: number[]; colNames: string[]; rowNames: string[];
  /** segment keys: `h{c},{r}` = (c,r)–(c+1,r), `v{c},{r}` = (c,r)–(c,r+1) */
  skip?: string[]; noData?: string[]; set?: Record<string, EdgeAttr>;
  extras?: { from: XY; to: XY; via?: XY[]; name: string; kind: EdgeKind; width: number; slope: number; surface: Surface }[];
  curbs?: Record<string, Curb>;
  parks?: [number, number][];
  places: { name: string; cat: PlaceCat; at: XY; note?: string }[];
  barriers: { type: HazardType; sev: Severity; at: XY; title: string; comment?: string }[];
  start: XY;
}
export interface Block { x0: number; y0: number; x1: number; y1: number; park: boolean }
export interface SampleArea { id: string; name: string; blurb: string; net: Network; blocks: Block[]; bounds: { x0: number; y0: number; x1: number; y1: number } }

const ANCHOR = { lng: 121.0, lat: 14.6 };
function hash(a: number, b: number, c: number) {
  let h = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 1274126177 + 1013904223;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return ((h >>> 0) % 100000) / 100000;
}

function build(d: AreaDef, seed: number): SampleArea {
  const P = makeProjection(ANCHOR), nodes: Record<string, GNode> = {}, edges: GEdge[] = [];
  const nid = (c: number, r: number) => `n${c}_${r}`;
  d.xs.forEach((x, c) => d.ys.forEach((y, r) => {
    const jx = (hash(c, r, seed) - 0.5) * 8, jy = (hash(r, c, seed + 1) - 0.5) * 8;
    nodes[nid(c, r)] = { id: nid(c, r), x: x + jx, y: y + jy, ll: P.fromLocal(x + jx, y + jy), curb: null, deg: 0 };
  }));
  let k = 0;
  const addEdge = (a: GNode, b: GNode, name: string, key: string, attr: EdgeAttr, known: boolean) => {
    const len = Math.hypot(a.x - b.x, a.y - b.y);
    const width = attr.width ?? Math.round((1.4 + hash(k, seed, 3) * 0.6) * 20) / 20;
    const slope = attr.slope ?? Math.round((hash(k, seed, 4) * 2 - 1) * 2.5 * 10) / 10;
    const surface = attr.surface ?? (hash(k, seed, 5) < 0.6 ? 'smooth' : 'fair');
    edges.push({ id: `${a.id}-${b.id}`, a: a.id, b: b.id, name: attr.name || name, kind: attr.kind || 'sidewalk', hw: 'sample', way: k++, legKey: attr.name || name, len, chunk: 0, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2,
      surveyed: known, source: known ? 'simulated' : undefined, ...(known ? { width, slope, surface } : {}) });
    void key;
  };
  d.xs.forEach((_, c) => d.ys.forEach((__, r) => {
    if (c < d.xs.length - 1) { const key = `h${c},${r}`; if (!d.skip?.includes(key)) addEdge(nodes[nid(c, r)], nodes[nid(c + 1, r)], d.rowNames[r], key, d.set?.[key] || {}, !d.noData?.includes(key)); }
    if (r < d.ys.length - 1) { const key = `v${c},${r}`; if (!d.skip?.includes(key)) addEdge(nodes[nid(c, r)], nodes[nid(c, r + 1)], d.colNames[c], key, d.set?.[key] || {}, !d.noData?.includes(key)); }
  }));
  for (const x of d.extras || []) {
    const chain = [nodes[nid(...x.from)], ...(x.via || []).map((v, i) => (nodes[`x${k}_${i}`] = { id: `x${k}_${i}`, x: v[0], y: v[1], ll: P.fromLocal(v[0], v[1]), curb: null, deg: 0 })), nodes[nid(...x.to)]];
    for (let i = 1; i < chain.length; i++) addEdge(chain[i - 1], chain[i], x.name, 'x', { kind: x.kind, width: x.width, slope: x.slope, surface: x.surface, name: x.name }, true);
  }
  for (const e of edges) { nodes[e.a].deg++; nodes[e.b].deg++; }
  for (const n of Object.values(nodes)) if (n.deg >= 3) n.curb = 'ok';
  for (const [key, v] of Object.entries(d.curbs || {})) { const [c, r] = key.split(',').map(Number); nodes[nid(c, r)].curb = v; }

  /* barriers: fixed points placed exactly on the nearest path */
  const onPath = (at: XY) => {
    let best: { e: GEdge; t: number; d: number } | null = null;
    for (const e of edges) { if (e.kind === 'stairs') continue; const a = nodes[e.a], b = nodes[e.b], r = segProject(at[0], at[1], a.x, a.y, b.x, b.y); if (!best || r.d < best.d) best = { e, t: r.t, d: r.d }; }
    const a = nodes[best!.e.a], b = nodes[best!.e.b];
    return P.fromLocal(a.x + (b.x - a.x) * best!.t, a.y + (b.y - a.y) * best!.t);
  };
  const hazards: Hazard[] = [], reports: Report[] = [];
  d.barriers.forEach((b, i) => {
    const h: Hazard = { id: `${d.id}-h${i + 1}`, type: b.type, sev: b.sev, source: 'simulated', geometry: { type: 'Point', coordinates: onPath(b.at) } };
    hazards.push(h);
    reports.push({ id: `${d.id}-r${i + 1}`, hazardId: h.id, title: b.title, author: 'Sample user', daysAgo: 1 + ((i * 3) % 9), ratings: [], contact: HAZARD_TYPES[b.type].agency, comments: b.comment ? [{ who: 'Sample user', text: b.comment, ago: '1 day ago' }] : [], simulated: true });
  });
  const places: Place[] = d.places.map((p, i) => ({ id: `${d.id}-p${i + 1}`, name: p.name, cat: p.cat, ll: P.fromLocal(p.at[0], p.at[1]), info: { kind: p.cat, position: 'Made-up sample place', address: p.note } }));

  const x0 = Math.min(...d.xs) - 40, x1 = Math.max(...d.xs) + 40, y0 = Math.min(...d.ys) - 40, y1 = Math.max(...d.ys) + 40;
  const coverage: LngLat[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => P.fromLocal(x, y));
  const blocks: Block[] = [];
  for (let c = 0; c < d.xs.length - 1; c++) for (let r = 0; r < d.ys.length - 1; r++)
    blocks.push({ x0: d.xs[c] + 11, x1: d.xs[c + 1] - 11, y0: d.ys[r] + 11, y1: d.ys[r + 1] - 11, park: !!d.parks?.some(([pc, pr]) => pc === c && pr === r) });
  const net: Network = {
    anchor: ANCHOR, areaName: d.name, covRadius: 0, coverage, nodes, edges, places, hazards, reports, defaultYou: onPath(d.start),
    meta: { ways: edges.length, edges: edges.length, nodes: Object.keys(nodes).length, pois: places.length, source: 'Made-up sample map', osmTimestamp: null, builtAt: '' },
  };
  return { id: d.id, name: d.name, blurb: d.blurb, net, blocks, bounds: { x0, y0, x1, y1 } };
}

const DEFS: AreaDef[] = [
  {
    id: 'school', name: 'Sample School District', blurb: 'Quiet streets around a school, a library and a pharmacy.',
    xs: [0, 110, 220, 330, 440], ys: [0, 95, 190, 285],
    colNames: ['Mabini St', 'Rizal Ave', 'Luna St', 'Bonifacio St', 'Aguinaldo St'], rowNames: ['Dahlia St', 'Rosal St', 'Sampaguita St', 'Ilang-Ilang St'],
    noData: ['h0,3', 'v0,2'], set: { 'h3,2': { slope: 9.5, surface: 'rough' }, 'v4,0': { width: 0.85 } },
    extras: [{ from: [3, 1], to: [4, 2], via: [[385, 140]], name: 'School shortcut (steps)', kind: 'stairs', width: 1.8, slope: 14, surface: 'fair' }],
    curbs: { '2,2': 'missing', '1,1': 'steep' }, parks: [[1, 2]],
    places: [
      { name: 'Sample Elementary School', cat: 'school', at: [275, 240] }, { name: 'Barangay Library', cat: 'gov', at: [55, 140] },
      { name: 'Corner Pharmacy', cat: 'health', at: [385, 48] }, { name: 'Sari-sari Store', cat: 'market', at: [165, -18] },
      { name: 'Covered Court', cat: 'gov', at: [385, 238] },
    ],
    barriers: [
      { type: 'obstruction', sev: 3, at: [165, 95], title: 'Parked tricycles block the sidewalk', comment: 'No space left for a wheelchair.' },
      { type: 'narrow', sev: 2, at: [220, 140], title: 'Narrow sidewalk beside a wall' },
      { type: 'pavement', sev: 2, at: [330, 245], title: 'Cracked pavement' },
    ],
    start: [30, 0],
  },
  {
    id: 'market', name: 'Sample Market Area', blurb: 'Busy streets around a public market and a bus stop.',
    xs: [0, 90, 200, 300, 420], ys: [0, 110, 200, 300],
    colNames: ['Tindahan St', 'Kalye Uno', 'Kalye Dos', 'Kalye Tres', 'Plaza St'], rowNames: ['Palengke Rd', 'Market St', 'Bagong Daan', 'Riverside Rd'],
    skip: ['h1,1', 'v3,0'], noData: ['h3,3', 'v4,2'], set: { 'v0,1': { surface: 'broken' } },
    curbs: { '3,1': 'missing', '1,2': 'steep' }, parks: [[2, 1]],
    places: [
      { name: 'Public Market', cat: 'market', at: [250, 155] }, { name: 'Bus Stop', cat: 'transport', at: [438, 150] },
      { name: 'Rural Bank', cat: 'bank', at: [145, 218] }, { name: 'Health Center', cat: 'health', at: [360, 318] },
      { name: 'Bakery', cat: 'food', at: [45, 58] },
    ],
    barriers: [
      { type: 'obstruction', sev: 3, at: [250, 110], title: 'Vendor stalls cover the walkway', comment: 'Every morning until noon.' },
      { type: 'flood', sev: 2, at: [90, 250], title: 'Flooded after rain' },
      { type: 'works', sev: 3, at: [360, 200], title: 'Road works, sidewalk closed' },
      { type: 'pavement', sev: 1, at: [150, 0], title: 'Small cracks, still passable' },
    ],
    start: [20, 300],
  },
  {
    id: 'hospital', name: 'Sample Hospital Area', blurb: 'A hospital, a park and a bus terminal on a gentle hill.',
    xs: [0, 120, 240, 360], ys: [0, 100, 200, 300, 380],
    colNames: ['North Rd', 'Central Ave', 'Park Lane', 'East Rd'], rowNames: ['Health Ave', 'Mercy St', 'Hope St', 'Unity St', 'Riverside Dr'],
    set: { 'v1,1': { slope: 11 }, 'v2,0': { slope: 6.5 } }, noData: ['h0,4'],
    extras: [{ from: [1, 2], to: [2, 3], via: [[170, 260]], name: 'Park path', kind: 'path', width: 2.2, slope: 1, surface: 'smooth' }],
    curbs: { '2,1': 'missing', '1,3': 'steep' }, parks: [[1, 2]],
    places: [
      { name: 'Sample General Hospital', cat: 'health', at: [300, 42] }, { name: 'Neighbourhood Pharmacy', cat: 'health', at: [60, 150] },
      { name: 'Chapel', cat: 'worship', at: [60, 345] }, { name: 'Bus Terminal', cat: 'transport', at: [378, 340] },
      { name: 'Carinderia', cat: 'food', at: [180, -18] },
    ],
    barriers: [
      { type: 'obstruction', sev: 3, at: [360, 60], title: 'Ambulance parking blocks the sidewalk' },
      { type: 'ramp', sev: 2, at: [240, 50], title: 'Steep ramp to the crossing' },
      { type: 'narrow', sev: 2, at: [120, 240], title: 'Sidewalk narrows at the bus shelter' },
    ],
    start: [20, 380],
  },
];

export const AREAS: SampleArea[] = DEFS.map((d, i) => build(d, 11 + i * 7));
export const areaById = (id: string) => AREAS.find((a) => a.id === id) || AREAS[0];
