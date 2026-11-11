'use client';
/* A drawn sample map (SVG). No live map tiles: blocks, streets and features are drawn from the sample
   area's own data in local metres, so everything stays in place at any zoom. */
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type PointerEvent as RPE, type Ref, type WheelEvent as RWE } from 'react';
import type { Engine } from '@/lib/engine/engine';
import { CATS } from '@/lib/engine/rules';
import type { EdgeEval, Hazard, LngLat, Route } from '@/lib/engine/types';
import type { SampleArea } from '@/lib/sample/areas';

export type Feature = { type: 'place' | 'edge' | 'hazard'; id: string } | null;
export interface MapHandle { fit(lls: LngLat[]): void; focus(ll: LngLat, k?: number): void }
export interface Layers { colors: boolean; hazards: boolean; places: boolean; curbs: boolean }
const COL = { teal: '#1C747C', navy: '#2C344C', good: '#2E9E63', fair: '#F2A900', poor: '#F27A1A', bad: '#E0312F', unknown: '#9AA5AE' };
const SEV_COL: Record<number, string> = { 1: '#F5D547', 2: '#F2A900', 3: '#FC3434' };
function color(ev: EdgeEval) { if (!ev.known) return COL.unknown; if (ev.crit.length) return COL.bad; const a = ev.avg!; return a >= 4 ? COL.good : a >= 3 ? COL.fair : a >= 2 ? COL.poor : COL.bad; }

interface Props {
  area: SampleArea; engine: Engine; rev: number; hazards: Hazard[]; layers: Layers;
  routes: Route[]; sel: number; doneS: number | null;
  you: LngLat; youDraggable: boolean; onYouDrag(ll: LngLat): void;
  dest: LngLat | null; selected: Feature; onSelect(f: Feature): void; onMapClick?(ll: LngLat): void;
  padding: { top: number; bottom: number }; handle: Ref<MapHandle>;
}

export default function SampleMap(p: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ W: 390, H: 700 });
  const [view, setView] = useState({ cx: 0, cy: 0, k: 1 });
  const P = p.engine.P;
  const S = (ll: LngLat): [number, number] => { const [x, y] = P.toLocal(ll); return [x, -y]; };
  const sizeRef = useRef(size); sizeRef.current = size;
  const padRef = useRef(p.padding); padRef.current = p.padding;

  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: el.clientHeight }));
    ro.observe(el); setSize({ W: el.clientWidth, H: el.clientHeight }); return () => ro.disconnect();
  }, []);

  const fitBox = (x0: number, y0: number, x1: number, y1: number) => {
    const { W, H } = sizeRef.current, { top, bottom } = padRef.current, Hv = Math.max(120, H - top - bottom);
    const k = Math.min(2.5, Math.max(0.2, (x1 - x0) / Math.max(100, W - 20), (y1 - y0) / Math.max(80, Hv - 24)));
    setView({ k, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 - (top + Hv / 2 - H / 2) * k });
  };
  useImperativeHandle(p.handle, () => ({
    fit(lls) { const pts = lls.map(S); fitBox(Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))); },
    focus(ll, k) {
      const [x, y] = S(ll), { H } = sizeRef.current, { top, bottom } = padRef.current, Hv = Math.max(120, H - top - bottom);
      setView((v) => { const kk = k ?? Math.min(v.k, 0.6); return { k: kk, cx: x, cy: y - (top + Hv / 2 - H / 2) * kk }; });
    },
  }));
  /* whole area in view whenever the area changes */
  useEffect(() => { const b = p.area.bounds; fitBox(b.x0 + 25, -b.y1 + 25, b.x1 - 25, -b.y0 - 25); }, [p.area.id, size.W, size.H]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- pan, pinch, wheel, taps ---------- */
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gest = useRef<{ moved: number; dragYou: boolean; youAt?: [number, number] } | null>(null);
  const [youDrag, setYouDrag] = useState<[number, number] | null>(null);
  const toWorld = (sx: number, sy: number): [number, number] => { const { W, H } = sizeRef.current; return [view.cx + (sx - W / 2) * view.k, view.cy + (sy - H / 2) * view.k]; };
  const local = (e: RPE | RWE) => { const r = box.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as [number, number]; };
  const onDown = (e: RPE) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const onYou = !!(e.target as Element).closest?.('[data-you]') && p.youDraggable;
    if (ptrs.current.size === 1) gest.current = { moved: 0, dragYou: onYou };
  };
  const onMove = (e: RPE) => {
    const prev = ptrs.current.get(e.pointerId); if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY }, g = gest.current;
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.entries()].map(([id, v]) => (id === e.pointerId ? cur : v));
      const [a0, b0] = [...ptrs.current.values()];
      const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y), d1 = Math.hypot(a.x - b.x, a.y - b.y);
      if (d0 > 0 && d1 > 0) setView((v) => ({ ...v, k: Math.min(2.5, Math.max(0.15, v.k * (d0 / d1))) }));
      if (g) g.moved += 99;
    } else if (g) {
      const dx = cur.x - prev.x, dy = cur.y - prev.y; g.moved += Math.abs(dx) + Math.abs(dy);
      if (g.dragYou) setYouDrag(toWorld(...local(e)));
      else setView((v) => ({ ...v, cx: v.cx - dx * v.k, cy: v.cy - dy * v.k }));
    }
    ptrs.current.set(e.pointerId, cur);
  };
  const onUp = (e: RPE) => {
    ptrs.current.delete(e.pointerId);
    const g = gest.current; if (ptrs.current.size > 0) return; gest.current = null;
    if (!g) return;
    if (g.dragYou && youDrag) { const [x, y] = youDrag; setYouDrag(null); p.onYouDrag(P.fromLocal(x, -y)); return; }
    if (g.moved > 8) return;
    const [wx, wy] = toWorld(...local(e));
    if (p.onMapClick) { p.onMapClick(P.fromLocal(wx, -wy)); return; }
    const t = (e.target as Element).closest?.('[data-f]');
    if (t) { const [type, id] = t.getAttribute('data-f')!.split('|'); p.onSelect({ type: type as 'place' | 'edge' | 'hazard', id }); }
    else p.onSelect(null);
  };
  const onWheel = (e: RWE) => {
    const [sx, sy] = local(e), f = Math.exp(e.deltaY * 0.0015);
    setView((v) => { const k = Math.min(2.5, Math.max(0.15, v.k * f)), { W, H } = sizeRef.current; const wx = v.cx + (sx - W / 2) * v.k, wy = v.cy + (sy - H / 2) * v.k; return { k, cx: wx - (sx - W / 2) * k, cy: wy - (sy - H / 2) * k }; });
  };
  const zoomBy = (f: number) => setView((v) => ({ ...v, k: Math.min(2.5, Math.max(0.15, v.k * f)) }));

  /* ---------- geometry (local metres, y flipped so north is up) ---------- */
  const edgesG = useMemo(() => p.engine.edges.map((e) => { const [a, b] = p.engine.edgeCoords(e); return { e, a: S(a), b: S(b), ev: p.engine.evalEdge(e) }; }), [p.engine, p.rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const labels = useMemo(() => {
    const best: Record<string, (typeof edgesG)[number]> = {};
    for (const g of edgesG) if (g.e.kind !== 'stairs' && (!best[g.e.name] || g.e.len > best[g.e.name].e.len)) best[g.e.name] = g;
    return Object.values(best);
  }, [edgesG]);
  const { W, H } = size, k = view.k, px = (n: number) => n * k;
  const vb = `${view.cx - (W / 2) * k} ${view.cy - (H / 2) * k} ${W * k} ${H * k}`;
  const R = p.routes[p.sel];
  const done = R && p.doneS && p.doneS > 0.5 ? p.engine.slice(R, 0, p.doneS) : [];
  const line = (pts: LngLat[]) => pts.map(S).map((q) => q.join(',')).join(' ');
  const you = youDrag || S(p.you), dest = p.dest ? S(p.dest) : null;

  return (
    <div className="map" ref={box} role="region" aria-label={`Sample map of ${p.area.name}`}>
      <svg width={W} height={H} viewBox={vb} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel} style={{ touchAction: 'none', cursor: p.onMapClick ? 'crosshair' : 'grab' }}>
        <rect x={view.cx - 5000} y={view.cy - 5000} width={10000} height={10000} fill="#E9F1EE" />
        {p.area.blocks.map((b, i) => <rect key={i} x={b.x0} y={-b.y1} width={b.x1 - b.x0} height={b.y1 - b.y0} rx={6} fill={b.park ? '#CDEBD7' : '#DCE7E3'} />)}
        {/* street bodies in real width */}
        {edgesG.filter((g) => g.e.kind === 'sidewalk').map((g) => <line key={'r' + g.e.id} x1={g.a[0]} y1={g.a[1]} x2={g.b[0]} y2={g.b[1]} stroke="#fff" strokeWidth={14} strokeLinecap="round" />)}
        {/* accessibility lines (constant screen width) */}
        {edgesG.map((g) => {
          const stairs = g.e.kind === 'stairs', show = p.layers.colors || stairs || !g.ev.known;
          return <g key={g.e.id} data-f={`edge|${g.e.id}`}>
            <line x1={g.a[0]} y1={g.a[1]} x2={g.b[0]} y2={g.b[1]} stroke="transparent" strokeWidth={px(22)} />
            {show && <line x1={g.a[0]} y1={g.a[1]} x2={g.b[0]} y2={g.b[1]} stroke={stairs ? '#6B5B4B' : p.layers.colors ? color(g.ev) : COL.unknown} strokeWidth={stairs ? 7 : 4.5} strokeDasharray={stairs ? '2 3' : g.ev.known ? undefined : '6 5'} strokeLinecap={stairs ? 'butt' : 'round'} vectorEffect="non-scaling-stroke" />}
          </g>;
        })}
        {k < 1.4 && labels.map((g) => {
          const ang = (Math.atan2(g.b[1] - g.a[1], g.b[0] - g.a[0]) * 180) / Math.PI, a = ang > 90 || ang < -90 ? ang + 180 : ang;
          return <text key={'t' + g.e.id} x={(g.a[0] + g.b[0]) / 2} y={(g.a[1] + g.b[1]) / 2} transform={`rotate(${a} ${(g.a[0] + g.b[0]) / 2} ${(g.a[1] + g.b[1]) / 2}) translate(0 ${px(-9)})`} fontSize={px(11)} textAnchor="middle" className="st-label">{g.e.name}</text>;
        })}
        {/* routes */}
        {p.routes.map((r, i) => i !== p.sel && <polyline key={r.id} points={line(r.coords)} fill="none" stroke="#86BCC1" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
        {R && <><polyline points={line(R.coords)} fill="none" stroke="#fff" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /><polyline points={line(R.coords)} fill="none" stroke={COL.teal} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></>}
        {done.length > 1 && <polyline points={line(done)} fill="none" stroke="#9AA5AE" strokeWidth={7} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        {p.layers.curbs && Object.values(p.engine.nodes).filter((n) => n.curb).map((n) => { const [x, y] = S(n.ll); return <circle key={n.id} cx={x} cy={y} r={px(5)} fill={n.curb === 'ok' ? COL.good : n.curb === 'steep' ? COL.poor : n.curb === 'missing' ? COL.bad : COL.unknown} stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />; })}
        {/* places */}
        {p.layers.places && p.engine.net.places.map((pl) => {
          const [x, y] = S(pl.ll), on = p.selected?.type === 'place' && p.selected.id === pl.id, c = CATS[pl.cat].color;
          return <g key={pl.id} data-f={`place|${pl.id}`} className="tap">
            <circle cx={x} cy={y} r={px(on ? 14 : 11)} fill={on ? c : '#fff'} stroke={c} strokeWidth={3.5} vectorEffect="non-scaling-stroke" />
            {(k < 0.9 || on) && <text x={x} y={y + px(on ? 30 : 26)} fontSize={px(12)} textAnchor="middle" className="pl-label">{pl.name}</text>}
          </g>;
        })}
        {/* barriers: fixed points on the path */}
        {p.layers.hazards && p.hazards.map((h) => {
          if (h.geometry.type !== 'Point') return null;
          const [x, y] = S(h.geometry.coordinates), on = p.selected?.type === 'hazard' && p.selected.id === h.id;
          return <g key={h.id} data-f={`hazard|${h.id}`} className="tap">
            {on && <circle cx={x} cy={y} r={px(21)} fill="rgba(148,68,220,.35)" />}
            <circle cx={x} cy={y} r={px(14)} fill={SEV_COL[h.sev]} stroke="#fff" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
            <text x={x} y={y + px(5.5)} fontSize={px(16)} textAnchor="middle" fontWeight={800} fill={h.sev === 3 ? '#fff' : COL.navy}>!</text>
          </g>;
        })}
        {dest && <path transform={`translate(${dest[0]} ${dest[1]}) scale(${k})`} d="M0 0C0 0-15-17-15-27a15 15 0 0 1 30 0c0 10-15 27-15 27z" fill="#FC3434" stroke="#fff" strokeWidth={2.5} />}
        <g data-you transform={`translate(${you[0]} ${you[1]})`} style={{ cursor: p.youDraggable ? 'grab' : 'default' }}>
          <circle r={px(22)} fill="rgba(44,52,76,.16)" /><circle r={px(11)} fill={COL.navy} stroke="#fff" strokeWidth={4} vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
      <div className="zoom"><button aria-label="Zoom in" onClick={() => zoomBy(0.7)}>+</button><button aria-label="Zoom out" onClick={() => zoomBy(1.4)}>−</button></div>
      <span className="map-badge">Sample map</span>
    </div>
  );
}
