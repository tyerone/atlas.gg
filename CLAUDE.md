# Atlas.gg — Claude Code Context

Read this file at the start of every session. It contains everything you need to know about this project.

---

## What is Atlas.gg?

Atlas.gg is a post-match spatial analytics dashboard for League of Legends. It turns official Riot API data into visual heatmaps and behavioral insights — showing players WHERE on the map their habits form across multiple games, not just outcome stats like KDA.

Built as part of StormForge 2026, Team 10. Showcase in ~14 days.

---

## The Problem We Solve

Current tools (op.gg, League client) show outcome stats. They don't show:
- Where you keep dying on the map across multiple games
- Whether you're isolated when you die
- Whether your wards cluster in predictable spots
- Whether you're absent from objectives repeatedly

Atlas shows all of this spatially and cross-game.

---

## Target Users

1. **Solo ranked players** — understand positioning habits without watching full replays
2. **University esports team captains / player-analysts** — replace manual VOD review (SFU Esports, UBC Esports are target contacts)
3. Note: Coach vs analyst roles at university level are often the same person — no dedicated staff

---

## Critical Technical Decision — NO .rofl Parsing

**DO NOT attempt to parse .rofl replay files.** This was investigated and ruled out for two reasons:
1. The payload is fully obfuscated packet data, updated every patch to prevent cheating
2. Riot would likely send a cease and desist

**Data sources we USE instead (all official, all legal):**

### Riot Match API (MATCH-V5)
- `GET /lol/match/v5/matches/{matchId}` — full match summary, KDA, CS, vision score, items, etc.

### Riot Match Timeline API (MATCH-V5 /timeline) — PRIMARY SPATIAL SOURCE
- `GET /lol/match/v5/matches/{matchId}/timeline`
- Returns **per-minute X/Y position snapshots for all 10 players** — this is the spatial data
- Returns **kill/death/ward events with X/Y coordinates**
- This powers the heatmap and all spatial insight cards

### Riot Account API
- `GET https://{region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}`
- Resolves Riot ID → PUUID for all subsequent calls

### Live Client Data API (future only)
- Runs at `https://127.0.0.1:2999` during active games
- Requires Electron to access localhost — NOT accessible from web app
- NOT needed for showcase MVP — listed here for future roadmap only

---

## Map Coordinate System

League of Legends Summoner's Rift coordinate system:
- X range: 0 → 14820
- Y range: 0 → 14881
- Y axis is INVERTED — Y increases upward in game, downward on screen
- Normalize to pixel: `pixelX = (gameX / 14820) * imageWidth`
- Normalize to pixel: `pixelY = imageHeight - ((gameY / 14881) * imageHeight)`

Key locations:
- Blue base: ~(580, 460)
- Red base: ~(14340, 14390)
- Dragon pit: ~(9800, 4400)
- Baron pit: ~(5000, 10300)

---

## Design System — Forge DS v1.1

**Fonts:**
- Logo only: `Syne` weight 600 (Google Fonts)
- Buttons, nav links, inputs, UI text: `Proxima Nova` Semibold (licensed — files in `/public/fonts/`)
- Labels, captions, body text: `Inter` weight 400/500 (Google Fonts)

**Font face setup (in globals.css):**
```css
@font-face {
  font-family: 'Proxima Nova';
  font-weight: 600;
  font-style: normal;
  src: url('/fonts/ProximaNova-Semibold.woff2') format('woff2'),
       url('/fonts/ProximaNova-Semibold.woff') format('woff');
}
```

**Color Tokens:**
```css
:root {
  /* Backgrounds */
  --bg-page:        #0a0c10;
  --bg-surface:     #0d1117;
  --bg-input:       rgba(255,255,255,0.06);
  --bg-card:        rgba(255,255,255,0.03);
  --bg-card-hover:  rgba(255,255,255,0.06);

  /* Brand */
  --blue:           #4f8ef7;
  --blue-muted:     rgba(79,142,247,0.15);
  --blue-subtle:    rgba(79,142,247,0.08);
  --blue-30:        rgba(79,142,247,0.30);

  /* Semantic */
  --red:            #E24B4A;
  --red-muted:      rgba(226,75,74,0.10);
  --amber:          #EF9F27;
  --amber-muted:    rgba(239,159,39,0.10);

  /* Text */
  --text-primary:   #ffffff;
  --text-secondary: rgba(255,255,255,0.50);
  --text-muted:     rgba(255,255,255,0.25);
  --text-hint:      rgba(255,255,255,0.12);
  --text-accent:    #6f92e5;   /* used for section labels, nav user pill */

  /* Borders */
  --border-default: rgba(255,255,255,0.07);
  --border-hover:   rgba(255,255,255,0.15);
  --border-focus:   #4f8ef7;
  --border-error:   #E24B4A;

  /* Radius */
  --radius-pill:    24px;   /* buttons, inputs, badges — all pill shaped */
  --radius-sm:      4px;
  --radius-md:      6px;
  --radius-lg:      8px;
  --radius-xl:      10px;
  --radius-2xl:     12px;
}
```

**Key component rules from Figma:**
- All buttons are pill-shaped (`border-radius: 24px`) — no square buttons
- All inputs are pill-shaped with icon inside (no prefix box)
- Nav background is `#0d1117` (surface), not transparent
- Nav links are Proxima Nova Semibold, `rgba(255,255,255,0.5)` default, white when active
- Logged-in user pill in nav: `#6f92e5` text, blue-muted background, blue border
- Section headings in DS use `#6f92e5` (soft periwinkle), not the main blue
- Input states: default (no border), focused (blue border), error (red border)
- Button sizes: primary 18px Proxima Nova, padding 13-14px vertical 24px horizontal

---

## Screens & User Flow

```
1. Entry (Riot ID) → 2. Match Selection → 3. Processing → 4. Pattern Report → 5. Drill-down
```

### Screen 1 — Entry (DONE)
- File: `01_entry.html` (reference HTML in project root or handoff folder)
- User enters Riot ID (format: Playername#TAG) and selects region
- Backend resolves Riot ID → PUUID via Riot Account API
- No account creation, no password
- On success: show connected state, navigate to match selection

### Screen 2 — Match Selection
- Auto-loads last 20 ranked matches using PUUID from MATCH-V5
- User selects 2–10 matches for cross-game analysis
- Filter by role, queue type, champion search
- "Analyze" button unlocks when 2+ matches selected
- Progress bar fills as matches are selected (max 10)

### Screen 3 — Processing
- Shown while backend fetches Timeline API for each selected match
- Animated step progress: Parsing → Extracting → Mapping → Detecting patterns → Generating report
- Target: under 30 seconds for 5 matches
- For demo: pre-process and fast-forward the loading animation

### Screen 4 — Cross-Game Pattern Report (HERO SCREEN)
- Critical insight card at top (red, prominent)
- Aggregate heatmap: death clusters (red), ward placements (blue), fight locations (amber)
- Phase performance bars: Early / Mid / Late (blue/amber/red based on score)
- Three insight card sections: Macro, Vision, Positioning
- Each card links to a timestamp in the drill-down
- Phase toggle: All / Early (0-14 min) / Mid (14-25 min) / Late (25+ min)

### Screen 5 — Individual Replay Drill-Down
- Navigated to from insight card timestamp links
- Breadcrumb: ← Pattern report / Game N · Champion · Timestamp
- "Why you're here" banner explaining which pattern this game exemplifies
- Single-game spatial map: deaths, wards, fight locations for this game only
- Game stats: KDA, CS, vision score, duration, phase performance bars
- Tabbed insight cards: Positioning / Vision / Macro
- Snapshot panel: clicking timestamp shows per-minute map state description

---

## Insight Engine Logic

### Overextension Detection
1. Get death X/Y from CHAMPION_KILL event
2. Classify death zone (river, enemy jungle, own jungle, lane) using coordinate rules
3. Get per-minute snapshot for nearest minute to death timestamp
4. Calculate distance from victim to nearest ally (Euclidean)
5. Count enemies within 2000 game units at that minute
6. Flag overextension if: zone = river/enemy jungle AND ally distance > 3000 AND enemies >= 2

### Death Clustering
1. Collect all death X/Y across selected games
2. Grid-based clustering: divide map into 500x500 unit cells
3. Flag any cell with 3+ deaths across 5 games as a death cluster

### Ward Clustering
1. Collect WARD_PLACED events across games
2. If 70%+ wards placed in same 3 grid cells → flag as predictable ward pattern

### Deaths Without Vision
1. For each death, check active wards within 90 seconds prior
2. If no ward within 1500 game units of death location → flag as death outside vision

### Phase Performance Score (0-100)
- CS per minute in phase: 25%
- Deaths in phase: 30% (negative)
- Objective presence: 25%
- Vision score in phase: 20%
- Color: blue (≥60%), amber (40-60%), red (<40%)

### Critical Insight Selection
- Score = frequency across games × severity weight
- Weights: Overextension 1.5x, Death cluster 1.3x, Deaths without vision 1.2x, Objective absence 1.1x, Ward clustering 1.0x
- Minimum: must appear in 3+ of selected games to qualify

---

## Project Structure

```
atlas-gg/
  public/
    fonts/
      ProximaNova-Semibold.woff2   ← PUT LICENSED FONT HERE
      ProximaNova-Semibold.woff
  src/
    app/
      page.js              ← Screen 1: Entry
      matches/
        page.js            ← Screen 2: Match selection
      report/
        page.js            ← Screen 3+4: Processing + Pattern report
      drill-down/
        page.js            ← Screen 5: Individual drill-down
      globals.css          ← Forge DS tokens (CSS variables)
      layout.js            ← Shared nav + font loading
    components/
      Nav.js               ← Shared navigation bar
      InsightCard.js        ← Reusable insight card component
      PhaseBar.js           ← Phase performance bar
      HeatMap.js            ← Map overlay component
      RegionPill.js         ← Region selector pill
```

---

## Frontend / Backend Split

**This repo is FRONTEND ONLY.** The developer is building pure HTML/CSS/JS (Next.js pages) and handing off to a backend team to connect to real APIs.

**Frontend responsibilities:**
- All UI, routing, and visual components
- Mock data for development (use realistic-looking placeholder data)
- sessionStorage for passing data between pages: `atlas_puuid`, `atlas_riot_id`, `atlas_region`
- All API call sites should be clearly commented with `// BACKEND INTEGRATION:` notes

**Backend responsibilities:**
- Riot API calls (never expose API key to client)
- Timeline data processing and insight engine
- Database storage of processed sessions
- Caching layer (Redis/Memcached)
- REST endpoints: `/api/connect`, `/api/matches`, `/api/analyze`, `/api/report/{matchIds}`

---

## Key Decisions Log

| Decision | Chosen | Reason |
|---|---|---|
| .rofl parsing | ❌ Rejected | Obfuscated, illegal per Riot ToS |
| Spatial data source | ✅ Match Timeline API | Official, legal, has X/Y per-minute snapshots |
| Desktop app | Electron (future) | Required to access Live Client API at localhost:2999 |
| Auth | Riot ID only, no login | Reduces friction, matches op.gg pattern |
| Entry point | Riot ID → Match selection | Removed old .rofl upload screen |
| Font: UI | Proxima Nova Semibold | Licensed, matches Figma DS |
| Font: Logo | Syne 600 | Matches Figma DS |
| Font: Labels | Inter 400/500 | Free, matches Figma DS |
| Button shape | Pill (24px radius) | Matches Figma DS |
| Design system name | Forge DS | Ties to StormForge, good metaphor |

---

## Figma File

Design file: `https://www.figma.com/design/2gMVi7JiAn2D8bcmbJP1KZ/atlas.gg`
Design system page node: `312-1178`

Always check Figma before building a new component — the source of truth is the Figma file, not memory.

---

## Legal

Must include on all public-facing pages:
> Atlas.gg is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing League of Legends. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc.

---

## Showcase Timeline

~14 days to showcase. Priority order:
1. Entry screen (done)
2. Match selection screen
3. Pattern report (hero screen — most important for demo)
4. Processing screen
5. Drill-down screen

For demo: pre-load data so processing is instant. The spatial report is the thing that needs to look polished.
