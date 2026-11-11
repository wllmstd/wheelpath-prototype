/* PROTOTYPE ONLY: there is no real authentication. Anyone can sign in with anything.
   Profiles are kept in this browser's localStorage; passwords are never stored. */
/** free text, e.g. "avoid stairs, steep slopes" */
export interface Profile { name: string; email: string; mobility: string; guest?: boolean }

const KEY = 'wheelpath-proto:profiles', SESSION = 'wheelpath-proto:session';
function read<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } }
function write(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } }

export function currentUser(): Profile | null { return read<Profile | null>(SESSION, null); }
export function signUp(p: Profile): Profile {
  const all = read<Record<string, Profile>>(KEY, {});
  const email = p.email.trim().toLowerCase(), prof = { ...p, email, name: p.name.trim() || email.split('@')[0] || 'Friend' };
  if (email) { all[email] = prof; write(KEY, all); }
  write(SESSION, prof); return prof;
}
/** route preferences suggested by the mobility text; undefined = leave the default */
export function prefsFromMobility(t: string): { stairs?: boolean; steep?: boolean; ramps?: boolean; shortest?: boolean } {
  const s = t.toLowerCase(), out: { stairs?: boolean; steep?: boolean; ramps?: boolean; shortest?: boolean } = {};
  if (/stair|step|hagdan/.test(s)) out.stairs = true;
  if (/steep|slope|hill|incline|ramp/.test(s)) out.steep = true;
  if (/curb|kerb/.test(s)) out.ramps = true;
  if (/short|fast|quick/.test(s)) out.shortest = true;
  return out;
}
/** any username or email works: a known one loads its profile, an unknown one creates a new profile */
export function signIn(email: string): Profile {
  const all = read<Record<string, Profile>>(KEY, {}), e = email.trim().toLowerCase();
  const prof = all[e] || { name: e.split('@')[0] || 'Friend', email: e, mobility: '' };
  write(SESSION, prof); return prof;
}
export function guest(): Profile { const prof: Profile = { name: 'Guest', email: '', mobility: '', guest: true }; write(SESSION, prof); return prof; }
export function signOut() { try { localStorage.removeItem(SESSION); } catch { /* */ } }
