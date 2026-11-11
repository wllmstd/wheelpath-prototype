'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { currentUser, signOut, type Profile } from '@/lib/auth';
import { Engine } from '@/lib/engine/engine';
import { haversine } from '@/lib/engine/geo';
import { CATS, CLS_LABEL, HAZARD_TYPES, SEV, SURF_LABEL, fmt } from '@/lib/engine/rules';
import type { Hazard, HazardType, LngLat, Place, Plan, Prefs, Report, Severity } from '@/lib/engine/types';
import { AREAS, areaById } from '@/lib/sample/areas';
import AuthScreens from './AuthScreens';
import SampleMap, { type Feature, type Layers, type MapHandle } from './SampleMap';
import { Icon, SevTag, Stars, Tag } from './ui';

type Screen = 'home' | 'search' | 'route' | 'details' | 'nav' | 'arrive' | 'problems' | 'report' | 'settings' | 'about';
interface NavRun { t: number; playing: boolean; speed: number; off: LngLat | null; reroutes: number }
const DEFAULT_PREFS: Prefs = { stairs: true, steep: true, ramps: true, shortest: false };
const DEFAULT_LAYERS: Layers = { colors: true, hazards: true, places: true, curbs: false };
const LS = 'wheelpath-proto:v1';
const rd = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(LS + ':' + k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const wr = (k: string, v: unknown) => { try { localStorage.setItem(LS + ':' + k, JSON.stringify(v)); } catch { /* */ } };

export default function ProtoApp() {
  const [user, setUser] = useState<Profile | null | undefined>(undefined);
  useEffect(() => setUser(currentUser()), []);
  if (user === undefined) return <div className="boot"><div className="wm">WHEELPATH</div></div>;
  if (!user) return <AuthScreens onDone={setUser} />;
  return <Main user={user} onSignOut={() => { signOut(); setUser(null); }} />;
}

function Main({ user, onSignOut }: { user: Profile; onSignOut(): void }) {
  const [areaId, setAreaId] = useState(AREAS[0].id);
  const area = areaById(areaId);
  const engine = useMemo(() => new Engine(area.net), [area]);
  useEffect(() => { (window as unknown as { wheelpath: unknown }).wheelpath = { engine, area }; }, [engine, area]);

  const [screen, setScreen] = useState<Screen>('home');
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const [you, setYou] = useState<LngLat>(area.net.defaultYou);
  const [hazards, setHazards] = useState<Hazard[]>(area.net.hazards);
  const [reports, setReports] = useState<Report[]>(area.net.reports);
  const [rev, setRev] = useState(0);
  const [selected, setSelected] = useState<Feature>(null);
  const [dest, setDest] = useState<Place | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [sel, setSel] = useState(0);
  const [warn, setWarn] = useState(false);
  const [nav, setNav] = useState<NavRun | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [areaOpen, setAreaOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [showAlts, setShowAlts] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [pick, setPick] = useState(false);
  const [form, setForm] = useState<{ type: HazardType; sev: Severity; ll: LngLat | null }>({ type: 'obstruction', sev: 2, ll: null });
  const [rating, setRating] = useState(0);
  const mapH = useRef<MapHandle>(null), bottomRef = useRef<HTMLDivElement>(null);
  const [padBottom, setPadBottom] = useState(140);

  useEffect(() => { setPrefs(rd('prefs', DEFAULT_PREFS)); setLayers(rd('layers', DEFAULT_LAYERS)); const a = rd('area', AREAS[0].id); if (AREAS.some((x) => x.id === a)) setAreaId(a); }, []);
  useEffect(() => wr('prefs', prefs), [prefs]);
  useEffect(() => wr('layers', layers), [layers]);
  /* a new area: fresh position, barriers and this device's own reports for that area */
  useEffect(() => {
    wr('area', areaId);
    const mine = rd<{ h: Hazard; r: Report }[]>('reports:' + areaId, []);
    setYou(area.net.defaultYou); setHazards([...area.net.hazards, ...mine.map((m) => m.h)]); setReports([...mine.map((m) => m.r), ...area.net.reports]);
    setSelected(null); setDest(null); setPlan(null); setNav(null); setScreen('home');
  }, [areaId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { engine.setHazards(hazards); setRev((r) => r + 1); }, [engine, hazards]);
  useEffect(() => { setMore(false); }, [selected]);
  useEffect(() => { setShowAlts(false); }, [plan]);
  useEffect(() => { const el = bottomRef.current; if (!el) return; const ro = new ResizeObserver(() => setPadBottom(Math.round(el.getBoundingClientRect().height))); ro.observe(el); return () => ro.disconnect(); });
  const say = useCallback((t: string) => { setToast(t); window.setTimeout(() => setToast((c) => (c === t ? null : c)), 3800); }, []);

  /* ---------- routes and the simulated walk ---------- */
  const R = plan?.routes[sel] ?? null;
  const navS = nav && R ? engine.sAtTime(R, nav.t) : 0;
  const pos: LngLat = screen === 'nav' && nav && R ? nav.off || engine.pointAt(R, navS).ll : you;

  function goTo(pl: Place) {
    setDest(pl); setSelected(null); setWarn(false);
    const p = engine.findRoutes(you, pl.ll, prefs); setPlan(p); setSel(0); setScreen('route');
    setTimeout(() => mapH.current?.fit([...p.routes[0].coords, pl.ll]), 60);
  }
  useEffect(() => { if (plan && dest && screen === 'route') { const p = engine.findRoutes(you, dest.ll, prefs); setPlan(p); setSel((s) => Math.min(s, p.routes.length - 1)); } }, [prefs, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  function start(force = false) {
    if (!R) return;
    if (R.criticalCount > 0 && !force) { setWarn(true); return; }
    setWarn(false); setNav({ t: 0, playing: true, speed: 8, off: null, reroutes: 0 }); setScreen('nav'); mapH.current?.focus(you, 0.45);
  }
  function stop(arrived: boolean) {
    setYou(arrived && dest ? engine.snap(dest.ll).ll : pos); setNav(null);
    if (arrived) { setRating(0); setScreen('arrive'); } else setScreen('route');
  }
  useEffect(() => {
    if (screen !== 'nav' || !nav?.playing || nav.off) return;
    let raf = 0, last = performance.now();
    const step = (now: number) => { const dt = Math.min(0.25, (now - last) / 1000); last = now; setNav((n) => (n && n.playing && !n.off ? { ...n, t: n.t + dt * n.speed } : n)); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [screen, nav?.playing, nav?.off, R]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (screen === 'nav' && nav && R && !nav.off && R.length - navS < 1.5) stop(true); }, [navS]); // eslint-disable-line react-hooks/exhaustive-deps
  const tick = Math.round(navS / 25);
  useEffect(() => { if (screen === 'nav') mapH.current?.focus(pos); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  function leave(at: LngLat, why: string) {
    if (!nav || !dest) return;
    setNav((n) => (n ? { ...n, off: at, playing: false } : n)); say(why + ' Finding a new route…');
    window.setTimeout(() => {
      const p = engine.findRoutes(at, dest.ll, prefs); setPlan(p); setSel(0); setYou(at);
      setNav((n) => (n ? { ...n, t: 0, off: null, playing: true, reroutes: n.reroutes + 1 } : n));
      say(`New route: ${fmt.dist(p.routes[0].length)}, ${CLS_LABEL[p.routes[0].cls].toLowerCase()}.`);
    }, 1300);
  }
  function wrongTurn() {
    if (!R || !nav) return;
    for (let i = 0; i < R.segs.length - 1; i++) {
      const sg = R.segs[i]; if (!sg.endNode || sg.s1 < navS + 5) continue;
      const nextE = R.segs[i + 1].e, opts = engine.adjacent(sg.endNode).filter((a) => a.e !== sg.e && a.e !== nextE && a.e.kind === 'sidewalk' && a.e.len > 20);
      if (!opts.length) continue;
      const e = opts[0].e; setNav((n) => (n ? { ...n, t: R.cumT[i + 1] } : n));
      leave(engine.pointFromNode(e, sg.endNode, Math.min(35, e.len * 0.6)), `Wrong turn onto ${e.name}.`); return;
    }
    say('No side street left before you arrive.');
  }
  function onYouDrag(ll: LngLat) {
    const sn = engine.snap(ll), at = sn.ll;
    if (screen === 'nav' && R) { const pr = engine.project(R, at); if (pr.d > 20) leave(at, 'You left the route.'); else setNav((n) => (n ? { ...n, t: engine.timeAt(R, pr.s) } : n)); return; }
    setYou(at);
    if (screen === 'route' && dest) { const p = engine.findRoutes(at, dest.ll, prefs); setPlan(p); setSel(0); }
  }

  /* ---------- reports ---------- */
  const reportLL = form.ll || pos;
  const reportSpans = useMemo(() => engine.spansFor({ type: 'Point', coordinates: reportLL }), [engine, reportLL]);
  function sendReport() {
    if (!reportSpans.length) { say('Choose a spot on a path.'); return; }
    const sp = reportSpans[0], id = 'u' + Date.now().toString(36);
    const h: Hazard = { id, type: form.type, sev: form.sev, source: 'user', geometry: { type: 'Point', coordinates: engine.edgeAt(engine.byId[sp.edgeId], sp.t0) } };
    const r: Report = { id: 'r' + id, hazardId: id, title: HAZARD_TYPES[form.type].label, author: user.name, daysAgo: 0, ratings: [], contact: HAZARD_TYPES[form.type].agency, comments: [], simulated: false };
    setHazards((l) => [...l, h]); setReports((l) => [r, ...l]);
    wr('reports:' + areaId, [...rd<{ h: Hazard; r: Report }[]>('reports:' + areaId, []), { h: { ...h, spans: undefined, anchor: undefined }, r }]);
    setForm({ type: 'obstruction', sev: 2, ll: null }); setPick(false); setScreen('home'); setSelected({ type: 'hazard', id });
    say('Thank you. Your report is on the map and routes are updated.');
  }
  const hz = (id: string) => hazards.find((h) => h.id === id);
  const rep = (hid: string) => reports.find((r) => r.hazardId === hid);
  const away = (ll: LngLat) => fmt.dist(haversine(pos, ll)) + ' away';

  /* ================= screens ================= */
  const CLS_ICON = { accessible: 'check', partial: 'alert', not: 'close', limited: 'info' } as const;
  const VERDICT = { accessible: ['Accessible route', 'Based on the sample data, this route meets the accessibility criteria.'], partial: ['Partially accessible', 'Some parts are difficult or have no data.'], not: ['Not accessible', 'This route has a barrier that may block a wheelchair.'], limited: ['Not enough data', 'Most of this route has no data.'] } as const;
  const close = <button className="icon-btn" aria-label="Close" onClick={() => setSelected(null)}><Icon name="close" /></button>;
  const tab = (s: Screen, icon: string, label: string) => <button className={'tab' + (screen === s ? ' on' : '')} aria-current={screen === s ? 'page' : undefined} onClick={() => { setSelected(null); setScreen(s); }}><Icon name={icon} size={24} /><span>{label}</span></button>;
  const tabbar = <nav className="tabbar" aria-label="Main">{tab('home', 'map', 'Map')}{tab('problems', 'alert', 'Problems')}{tab('settings', 'sliders', 'Settings')}</nav>;
  const back = (to: Screen, label = 'Back') => <button className="icon-btn" aria-label={label} onClick={() => setScreen(to)}><Icon name="back" /></button>;

  function card(): ReactNode {
    if (!selected) return null;
    if (selected.type === 'place') {
      const pl = engine.net.places.find((x) => x.id === selected.id); if (!pl) return null;
      return (<div className="card" role="dialog" aria-label={pl.name}>
        <div className="row"><div className="grow"><h2>{pl.name}</h2><p className="meta">{CATS[pl.cat].label} · {away(pl.ll)}</p></div>{close}</div>
        <button className="btn big" onClick={() => goTo(pl)}><Icon name="flag" size={20} /> Go here</button></div>);
    }
    if (selected.type === 'hazard') {
      const h = hz(selected.id); if (!h || h.geometry.type !== 'Point') return null;
      const r = rep(h.id), e = h.spans?.[0] ? engine.byId[h.spans[0].edgeId] : null;
      return (<div className="card" role="dialog" aria-label="Problem">
        <div className="row"><div className="grow"><h2>{r?.title || HAZARD_TYPES[h.type].label}</h2><p className="meta">{e?.name} · {away(h.geometry.coordinates)}</p></div>{close}</div>
        <div className="row gap wrap"><SevTag sev={h.sev} />{h.source === 'user' ? <Tag kind="info">Your report</Tag> : <span className="small">Sample report</span>}</div>
        <p className="small">{HAZARD_TYPES[h.type].desc}{r?.comments[0] ? ` “${r.comments[0].text}”` : ''}</p></div>);
    }
    const e = engine.byId[selected.id]; if (!e) return null;
    const ev = engine.evalEdge(e);
    return (<div className="card" role="dialog" aria-label="Path">
      <div className="row"><div className="grow"><h2>{e.name}</h2><p className="meta">{e.kind === 'stairs' ? 'Steps, no ramp' : ev.known ? <><Stars value={ev.avg} size={14} /> {fmt.n1(ev.avg)}</> : 'No data'}</p></div>{close}</div>
      {ev.known && e.kind !== 'stairs' && <p className="small">Width {e.width!.toFixed(2)} m · Slope {Math.abs(e.slope!).toFixed(1)} % · {SURF_LABEL[e.surface!]}. Sample values.</p>}
      <div className="row gap"><button className="btn line sm grow" onClick={() => { setYou(engine.snap(engine.edgeAt(e, 0.5)).ll); setSelected(null); }}>Start from here</button><button className="btn line sm grow" onClick={() => { setForm((f) => ({ ...f, ll: engine.edgeAt(e, 0.5) })); setSelected(null); setScreen('report'); }}>Report a problem</button></div></div>);
  }

  function routeCard(): ReactNode {
    if (!plan || !R || !dest) return null;
    const [title, sub] = VERDICT[R.cls], issues = R.barriers.filter((b) => b.kind !== 'unverified');
    return (<div className="sheet">
      <div className={'verdict v-' + R.cls}><span className={'v-ic c-' + R.cls}><Icon name={CLS_ICON[R.cls]} size={22} /></span>
        <div className="grow"><h2>{title}</h2><p className="v-meta"><b>{fmt.mins(R.time)}</b> · {fmt.dist(R.length)}{R.ratings && <> · <Stars value={R.ratings.avg} size={14} /></>}</p><p className="small">{sub}</p></div></div>
      {warn ? <div className="warn-box"><p><b>This route may not be passable in a wheelchair.</b></p><div className="row gap"><button className="btn line grow" onClick={() => setWarn(false)}>Go back</button><button className="btn grow" onClick={() => start(true)}>Start anyway</button></div></div>
        : <button className="btn big" onClick={() => start()}>Start</button>}
      <div className="links"><button className="linkbtn" onClick={() => setScreen('details')}>What’s on the way{issues.length ? ` (${issues.length})` : ''}</button>
        {plan.routes.length > 1 && <button className="linkbtn" onClick={() => setShowAlts((v) => !v)} aria-expanded={showAlts}>{showAlts ? 'Hide other routes' : `Other routes (${plan.routes.length - 1})`}</button>}</div>
      {showAlts && <div className="alts" role="radiogroup" aria-label="Routes">{plan.routes.map((r, i) => (
        <button key={r.id} role="radio" aria-checked={i === sel} className={'alt' + (i === sel ? ' on' : '')} onClick={() => { setSel(i); setWarn(false); }}>
          <span className={'dot c-' + r.cls} /><span className="grow"><b>{CLS_LABEL[r.cls]}</b><small>{fmt.mins(r.time)} · {fmt.dist(r.length)}</small></span>{i === sel && <Icon name="check" size={18} />}</button>))}</div>}
    </div>);
  }

  const mapScreen = screen === 'home' || screen === 'route' || screen === 'nav' || screen === 'arrive' || (screen === 'report' && pick);
  const ns = screen === 'nav' && R && dest && nav ? engine.navState(R, navS, dest.name) : null;
  let overlay: ReactNode = null, bottom: ReactNode = null, page: ReactNode = null;

  if (screen === 'home') {
    overlay = (<div className="top">
      <button className="searchbar" onClick={() => setScreen('search')}><Icon name="search" /><span>Where do you want to go?</span></button>
      <button className="area-chip" onClick={() => setAreaOpen(true)} aria-haspopup="dialog"><Icon name="pin" size={16} /> {area.name} <span aria-hidden="true">▾</span></button>
    </div>);
    bottom = (<>{card() || <><button className="fab-report" onClick={() => { setForm((f) => ({ ...f, ll: null })); setScreen('report'); }}><Icon name="plus" size={20} /> Report a problem</button>
      <div className="loc-card"><span className="grow small">Hi {user.name}. Drag the dark dot to set where you start.</span></div></>}{tabbar}</>);
  } else if (screen === 'route') {
    overlay = <div className="top"><div className="row gap"><button className="icon-btn solid" aria-label="Back" onClick={() => { setPlan(null); setDest(null); setScreen('home'); }}><Icon name="back" /></button><div className="tobar grow"><small>To</small> <b>{dest?.name}</b></div></div></div>;
    bottom = routeCard();
  } else if (screen === 'nav' && ns && R && nav) {
    overlay = <div className="top"><div className="instr"><span className="instr-ic"><Icon name={ns.icon} size={30} /></span><div><b>{nav.off ? 'Off the route. Finding a new one…' : ns.text}</b><small>{ns.street}</small></div></div></div>;
    bottom = (<div className="sheet navsheet">
      <p className="big-stat"><b>{fmt.mins(ns.timeLeft)}</b> · {fmt.dist(ns.remTotal)} left</p>
      <div className="bar"><i style={{ width: (navS / Math.max(1, R.length)) * 100 + '%' }} /></div>
      <div className="row gap"><button className="btn line grow" disabled={!!nav.off} onClick={() => setNav((n) => (n ? { ...n, playing: !n.playing } : n))}><Icon name={nav.playing ? 'pause' : 'play'} size={18} /> {nav.playing ? 'Pause' : 'Resume'}</button><button className="btn stop grow" onClick={() => stop(false)}>Stop</button></div>
      <button className="linkbtn" onClick={() => setDemoOpen((v) => !v)} aria-expanded={demoOpen}>{demoOpen ? 'Hide demo controls' : 'Demo controls'}</button>
      {demoOpen && <div className="demo"><div className="seg" role="radiogroup" aria-label="Speed">{[1, 4, 8, 16].map((v) => <button key={v} role="radio" aria-checked={nav.speed === v} className={nav.speed === v ? 'on' : ''} onClick={() => setNav((n) => (n ? { ...n, speed: v } : n))}>{v}×</button>)}</div>
        <button className="btn line sm" disabled={!!nav.off} onClick={wrongTurn}>Take a wrong turn</button><p className="small">This is a simulated walk on a sample map.</p></div>}
    </div>);
  } else if (screen === 'arrive' && dest) {
    bottom = (<div className="sheet center"><span className="v-ic c-accessible big-ic"><Icon name="check" size={30} /></span><h2>You’ve arrived</h2><p className="small">{dest.name}</p><p>How was this route?</p>
      <div className="rate" role="radiogroup" aria-label="Your rating">{[1, 2, 3, 4, 5].map((v) => <button key={v} role="radio" aria-checked={rating === v} aria-label={v + ' stars'} className={rating >= v ? 'on' : ''} onClick={() => setRating(v)}>★</button>)}</div>
      <button className="btn big" onClick={() => { if (rating) say('Thank you for rating this route.'); setPlan(null); setDest(null); setScreen('home'); }}>Done</button></div>);
  } else if (screen === 'report' && pick) {
    overlay = <div className="top"><div className="card row gap"><b className="grow">Tap the spot on the map</b><button className="btn line sm" onClick={() => setPick(false)}>Cancel</button></div></div>;
  }

  if (screen === 'details' && R) {
    const issues = R.barriers.filter((b) => b.kind !== 'unverified');
    page = (<div className="page"><div className="pagehead row gap">{back('route', 'Back to the map')}<h1 className="grow h-sm">What’s on the way</h1></div>
      {issues.length ? <ul className="ways">{issues.map((b, i) => <li key={i}><button onClick={() => { setScreen('route'); if (b.hazardId) setSelected({ type: 'hazard', id: b.hazardId }); setTimeout(() => mapH.current?.focus(b.ll, 0.35), 60); }}><span className={'dot ' + (b.kind === 'critical' ? 'c-not' : 'c-partial')} /><span className="grow"><b>{b.label}</b><small>{b.where} · after {fmt.dist(b.s)}</small></span></button></li>)}</ul> : <p>Nothing reported on this route.</p>}
      {R.unknownShare > 0 && <p className="small">{Math.round(R.unknownShare * 100)}% of this route has no data.</p>}
      {R.ratings && <div className="ratings">{([['Hazards', R.ratings.hazards], ['Ramps and slopes', R.ratings.ramp], ['Sidewalk width', R.ratings.width], ['Surface', R.ratings.surface]] as const).map(([k2, v]) => <div key={k2} className="rat"><div className="row"><span className="grow">{k2}</span><b>{fmt.n1(v)}</b></div><div className="bar"><i style={{ width: (v / 5) * 100 + '%' }} /></div></div>)}</div>}
      <p className="small">Sample map and sample data. Always check conditions on site.</p></div>);
  } else if (screen === 'search') {
    const res = engine.searchPlaces(query, pos, CATS);
    page = (<div className="page"><div className="pagehead row gap">{back('home')}<input autoFocus className="input grow" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${area.name}`} aria-label="Search places" /></div>
      <ul className="list">{res.map(({ p, d }) => <li key={p.id}><button onClick={() => { setQuery(''); setScreen('home'); setSelected({ type: 'place', id: p.id }); setTimeout(() => mapH.current?.focus(p.ll), 60); }}><span className="dot" style={{ background: CATS[p.cat].color }} /><span className="grow"><b>{p.name}</b><small>{CATS[p.cat].label} · {fmt.dist(d)}</small></span></button></li>)}
        {!res.length && <li className="small empty">No places match.</li>}</ul></div>);
  } else if (screen === 'problems') {
    const list = reports.map((r) => ({ r, h: hz(r.hazardId) })).filter((x): x is { r: Report; h: Hazard } => !!x.h && x.h.geometry.type === 'Point')
      .map((x) => ({ ...x, d: haversine(pos, (x.h.geometry as { coordinates: LngLat }).coordinates) })).sort((a, b) => a.d - b.d);
    page = (<div className="page"><div className="pagehead"><h1>Problems</h1><p className="lead">Reported problems in {area.name}.</p></div>
      <ul className="list">{list.map(({ r, h, d }) => <li key={r.id}><button onClick={() => { setScreen('home'); setSelected({ type: 'hazard', id: h.id }); setTimeout(() => mapH.current?.focus((h.geometry as { coordinates: LngLat }).coordinates, 0.4), 60); }}><span className={'hz-ic sev' + h.sev}>!</span><span className="grow"><b>{r.title}</b><small>{h.spans?.[0] ? engine.byId[h.spans[0].edgeId]?.name : ''} · {fmt.dist(d)}</small></span></button></li>)}</ul>
      <button className="btn report floating" onClick={() => { setForm((f) => ({ ...f, ll: null })); setScreen('report'); }}><Icon name="plus" size={18} /> Report a problem</button>{tabbar}</div>);
  } else if (screen === 'report' && !pick) {
    const e = reportSpans[0] ? engine.byId[reportSpans[0].edgeId] : null;
    const TYPES: HazardType[] = ['obstruction', 'pavement', 'narrow', 'ramp', 'drain', 'flood', 'works', 'other'];
    page = (<div className="page"><div className="pagehead row gap">{back('home')}<h1 className="grow h-sm">Report a problem</h1></div>
      <form className="form" onSubmit={(ev) => { ev.preventDefault(); sendReport(); }}>
        <fieldset><legend>1. What is the problem?</legend><div className="tiles">{TYPES.map((k2) => <button type="button" key={k2} className={'tile' + (form.type === k2 ? ' on' : '')} aria-pressed={form.type === k2} onClick={() => setForm((f) => ({ ...f, type: k2, sev: HAZARD_TYPES[k2].sev }))}>{HAZARD_TYPES[k2].label}</button>)}</div></fieldset>
        <fieldset><legend>2. How bad is it?</legend><div className="stack">{([1, 2, 3] as Severity[]).map((v) => <button type="button" key={v} className={'choice' + (form.sev === v ? ' on' : '')} aria-pressed={form.sev === v} onClick={() => setForm((f) => ({ ...f, sev: v }))}><span className={'dot sev' + v} />{SEV[v].label}</button>)}</div></fieldset>
        <fieldset><legend>3. Where is it?</legend><div className="where"><span className="grow">{e ? <><b>{e.name}</b><small>{form.ll ? 'Spot you chose' : 'Where you are'}</small></> : <span className="warn-text">That spot is not on a path.</span>}</span><button type="button" className="btn line sm" onClick={() => setPick(true)}><Icon name="pin" size={16} /> Choose on map</button></div></fieldset>
        <button className="btn big report" type="submit" disabled={!e}>Send report</button>
        <p className="small">Reports are saved on this device only in this prototype.</p>
      </form></div>);
  } else if (screen === 'settings') {
    const t = (on: boolean, set: (v: boolean) => void, title: string, desc?: string) => <label className="toggle" key={title}><span className="grow"><b>{title}</b>{desc && <small>{desc}</small>}</span><input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} /><i aria-hidden="true" /></label>;
    const pf = (k2: keyof Prefs) => (v: boolean) => setPrefs((p) => ({ ...p, [k2]: v }));
    const ly = (k2: keyof Layers) => (v: boolean) => setLayers((l) => ({ ...l, [k2]: v }));
    page = (<div className="page"><div className="pagehead"><h1>Settings</h1></div>
      <div className="profile"><span className="avatar" aria-hidden="true">{(user.name[0] || '?').toUpperCase()}</span><div className="grow"><b>{user.name}</b><small>{user.guest ? 'Guest' : user.email || 'No email'}{user.mobility ? ` · ${user.mobility}` : ''}</small></div><button className="btn line sm" onClick={onSignOut}>Sign out</button></div>
      <h2 className="sec">My routes</h2><div className="group">{t(prefs.stairs, pf('stairs'), 'Avoid stairs')}{t(prefs.steep, pf('steep'), 'Avoid steep slopes')}{t(prefs.ramps, pf('ramps'), 'Prefer curb ramps')}{t(prefs.shortest, pf('shortest'), 'Prefer shorter routes', 'Distance counts more than comfort')}</div>
      <h2 className="sec">Map</h2><div className="group">{t(layers.hazards, ly('hazards'), 'Show problems')}{t(layers.places, ly('places'), 'Show places')}{t(layers.colors, ly('colors'), 'Colour paths by accessibility')}{t(layers.curbs, ly('curbs'), 'Show curb ramps')}</div>
      <div className="legend"><span><i style={{ background: '#2E9E63' }} />Good</span><span><i style={{ background: '#F2A900' }} />Fair</span><span><i style={{ background: '#E0312F' }} />Difficult or blocked</span><span><i className="dash" />No data</span></div>
      <button className="btn line" onClick={() => setScreen('about')}>About this prototype</button>{tabbar}</div>);
  } else if (screen === 'about') {
    page = (<div className="page prose"><div className="pagehead row gap">{back('settings')}<h1 className="grow h-sm">About this prototype</h1></div>
      <p>WheelPath helps wheelchair users find the most accessible route. It checks each path for width, slope, surface, curb ramps and reported problems.</p>
      <h2>Please note</h2><p>The three areas, their streets, places and problems are <b>made up</b> for this prototype. There is no live map and no real location yet. Sign-in is open to anyone and has no security.</p>
      <h2>Route ratings</h2><ul className="plain"><li><b>Accessible</b>: no barriers found in the data.</li><li><b>Partially accessible</b>: some difficult parts, or parts with no data.</li><li><b>Not accessible</b>: a barrier that may block a wheelchair.</li><li><b>Not enough data</b>: most of the route has no data.</li></ul></div>);
  }

  return (
    <div className={'app' + (mapScreen ? '' : ' paged')}>
      <SampleMap area={area} engine={engine} rev={rev} hazards={hazards} layers={layers} routes={screen === 'route' ? (plan?.routes ?? []).filter((_, i) => showAlts || i === sel) : screen === 'nav' && R ? [R] : []}
        sel={screen === 'route' && showAlts ? sel : 0} doneS={screen === 'nav' ? navS : null} you={pos} youDraggable={screen !== 'arrive' && !(screen === 'nav' && nav?.off)} onYouDrag={onYouDrag}
        dest={dest && (screen === 'route' || screen === 'nav' || screen === 'arrive') ? dest.ll : null} selected={selected} onSelect={setSelected}
        onMapClick={pick ? (ll) => { setForm((f) => ({ ...f, ll })); setPick(false); } : undefined}
        padding={{ top: mapScreen ? (screen === 'nav' ? 130 : 120) : 0, bottom: mapScreen ? padBottom : 0 }} handle={mapH} />
      {mapScreen && <>{overlay}<div className="bottom" ref={bottomRef}>{bottom}</div></>}
      {page}
      {areaOpen && <div className="backdrop" onClick={() => setAreaOpen(false)}><div className="sheet" role="dialog" aria-label="Choose a sample area" onClick={(e) => e.stopPropagation()}>
        <div className="row"><h2 className="grow">Choose an area</h2><button className="icon-btn" aria-label="Close" onClick={() => setAreaOpen(false)}><Icon name="close" /></button></div>
        <div className="alts">{AREAS.map((a) => <button key={a.id} className={'alt' + (a.id === areaId ? ' on' : '')} onClick={() => { setAreaId(a.id); setAreaOpen(false); }}><span className="grow"><b>{a.name}</b><small>{a.blurb}</small></span>{a.id === areaId && <Icon name="check" size={18} />}</button>)}</div>
        <p className="small">All three are made-up sample areas.</p></div></div>}
      {toast && <div className={'toast' + (screen === 'nav' ? ' low' : '')} role="status">{toast}</div>}
    </div>
  );
}
