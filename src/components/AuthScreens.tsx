'use client';
import { useState } from 'react';
import { prefsFromMobility, signIn, signUp, type Profile } from '@/lib/auth';
import { Icon } from './ui';

/* Log in and Sign up, following the WheelPath design. PROTOTYPE: anyone can get in; there is no security. */
export default function AuthScreens({ onDone }: { onDone(p: Profile): void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [id, setId] = useState(''), [name, setName] = useState(''), [email, setEmail] = useState(''), [pw, setPw] = useState(''), [mob, setMob] = useState('');
  const [forgot, setForgot] = useState(false);

  const band = (small: boolean) => (
    <div className={'auth-band' + (small ? ' small' : '')}>
      {small && <button type="button" className="auth-back" aria-label="Back to log in" onClick={() => setMode('in')}><Icon name="back" size={26} /></button>}
      <div className="wm">WHEELPATH</div>
      <img className="auth-hero" src="/hero.svg" alt="" />
    </div>
  );

  if (mode === 'in') return (
    <div className="auth-page">
      {band(false)}
      <form className="auth-sheet" onSubmit={(e) => { e.preventDefault(); onDone(signIn(id || 'guest')); }}>
        <h1>Welcome back</h1>
        <p className="auth-sub">Log in to find routes that work for you.</p>
        <label className="auth-field"><span>Username / email address</span><input value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" placeholder="delacruzjuan@gmail.com" /></label>
        <label className="auth-field"><span>Password</span><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" placeholder="Password" /></label>
        <button type="button" className="auth-link" onClick={() => setForgot((v) => !v)} aria-expanded={forgot}>Forgot password?</button>
        {forgot && <p className="auth-note" role="status">This is a prototype, so any password works. Just log in.</p>}
        <button type="submit" className="auth-btn">Log in</button>
        <p className="auth-switch">New to WheelPath? <button type="button" className="auth-link" onClick={() => setMode('up')}>Sign up</button></p>
      </form>
    </div>
  );
  return (
    <div className="auth-page">
      {band(true)}
      <form className="auth-sheet" onSubmit={(e) => {
        e.preventDefault();
        const prof = signUp({ name, email, mobility: mob.trim() });
        const pf = prefsFromMobility(mob);
        if (Object.keys(pf).length) try { const k = 'wheelpath-proto:v1:prefs', cur = JSON.parse(localStorage.getItem(k) || 'null') || { stairs: true, steep: true, ramps: true, shortest: false }; localStorage.setItem(k, JSON.stringify({ ...cur, ...pf })); } catch { /* */ }
        onDone(prof);
      }}>
        <h1>Create your account</h1>
        <p className="auth-sub">Just a few details to get started.</p>
        <label className="auth-field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Juan Dela Cruz" /></label>
        <label className="auth-field"><span>Email</span><input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="juandelacruz@gmail.com" /></label>
        <label className="auth-field"><span>Password</span><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="Password" /></label>
        <label className="auth-field"><span>Mobility preference <em>(optional)</em></span><input value={mob} onChange={(e) => setMob(e.target.value)} placeholder="e.g., avoid stairs, steep slopes" /></label>
        <p className="auth-hint">You can change this anytime in Preferences.</p>
        <button type="submit" className="auth-btn">Sign up</button>
        <p className="auth-switch">Already registered? <button type="button" className="auth-link" onClick={() => setMode('in')}>Log in</button></p>
      </form>
    </div>
  );
}
