# WheelPath Prototype

A simple prototype of WheelPath, the accessibility-first navigation app for wheelchair users.

- **Sample maps only**: three made-up areas (Sample School District, Sample Market Area, Sample Hospital Area). No live map tiles and no GPS yet.
- **Simple barriers**: parked vehicles, vendor stalls, narrow or cracked sidewalks, steep ramps, flooding, road works, missing curb ramps and steps.
- **Open sign-in and sign-up**: anyone can get in with any email and password, or continue as a guest. **There is no security.** Profiles are kept only in the browser; passwords are never stored.
- Uses the same accessibility-routing engine and rating rules as the main WheelPath app (`src/lib/engine`, copied from the main repo).

## Run it

```bash
npm install
npm run dev     # http://localhost:3000
```

## How to use

1. Sign in, create an account, or continue as a guest.
2. Pick an area with the button under the search bar.
3. Drag the dark dot to where you start. Tap a place and choose **Go here**.
4. Read the route verdict and press **Start** for a simulated walk (Pause, Stop, and Demo controls for speed and a wrong turn).
5. Report a problem with the purple button; routes update right away.

## Code

```
src/lib/sample/areas.ts      the three made-up areas: streets, places, barriers
src/lib/engine/              routing engine and rules (shared with the main app)
src/lib/auth.ts              open sign-in / sign-up (prototype only, no security)
src/components/SampleMap.tsx drawn SVG map with pan and zoom
src/components/ProtoApp.tsx  screens
src/components/AuthScreens.tsx welcome, sign in, sign up
```

Everything in the sample areas is invented. Rating thresholds are prototype defaults to be confirmed against the NCDA 2024 Revised IRR checklist (BP 344).
