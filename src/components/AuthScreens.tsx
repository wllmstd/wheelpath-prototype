'use client';
import { useState } from 'react';
import { guest, signIn, signUp, type Mobility, type Profile } from '@/lib/auth';
import { Icon } from './ui';

export default function AuthScreens({ onDone }: { onDone(p: Profile): void }) {
  const [mode, setMode] = useState<'welcome' | 'in' | 'up'>('welcome');
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [pw, setPw] = useState(''), [mob, setMob] = useState<Mobility>('');
  const note = <p className="small center-text">Prototype only: there are no real accounts or security. Do not use a real password.</p>;

  if (mode === 'welcome') return (
    <div className="auth">
      <div className="auth-hero"><div className="wm">WHEELPATH</div><p className="lead">Find routes that work for your wheelchair.</p></div>
      <div className="stack">
        <button className="btn big" onClick={() => setMode('in')}>Sign in</button>
        <button className="btn big line" onClick={() => setMode('up')}>Create an account</button>
        <button className="linkbtn center" onClick={() => onDone(guest())}>Continue as guest</button>
      </div>
      {note}
    </div>
  );
  const back = <button className="icon-btn" aria-label="Back" onClick={() => setMode('welcome')}><Icon name="back" /></button>;
  if (mode === 'in') return (
    <form className="auth" onSubmit={(e) => { e.preventDefault(); onDone(signIn(email)); }}>
      <div className="row gap">{back}<h1 className="grow">Sign in</h1></div>
      <label className="field"><span>Email</span><input className="input" type="email" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
      <label className="field"><span>Password</span><input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Anything works" /></label>
      <button className="btn big" type="submit">Sign in</button>
      <button type="button" className="linkbtn center" onClick={() => setMode('up')}>New here? Create an account</button>
      {note}
    </form>
  );
  return (
    <form className="auth" onSubmit={(e) => { e.preventDefault(); onDone(signUp({ name, email, mobility: mob })); }}>
      <div className="row gap">{back}<h1 className="grow">Create an account</h1></div>
      <label className="field"><span>Your name</span><input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan" /></label>
      <label className="field"><span>Email</span><input className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
      <label className="field"><span>Password</span><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Anything works" /></label>
      <fieldset className="field"><legend>I use (optional)</legend><div className="stack">
        {([['manual', 'A manual wheelchair'], ['power', 'A power wheelchair'], ['other', 'Another mobility aid']] as const).map(([k, l]) => <button type="button" key={k} className={'choice' + (mob === k ? ' on' : '')} aria-pressed={mob === k} onClick={() => setMob(mob === k ? '' : k)}>{l}</button>)}
      </div></fieldset>
      <button className="btn big" type="submit">Create account</button>
      {note}
    </form>
  );
}
