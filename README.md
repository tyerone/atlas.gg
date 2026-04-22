# Atlas.gg

Atlas.gg is a post-match spatial analytics dashboard for League of Legends.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Add environment variables:

```bash
cp .env.example .env.local
```

Set `RIOT_API_KEY` in `.env.local`.

3. Run the dev server:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## Implemented Riot API Flows

- `POST /api/connect`: Riot ID + platform region to PUUID
- `GET /api/matches`: latest matches for a PUUID
- `POST /api/report`: report statistics computed from selected matches + timelines

Riot API calls are executed server-side. The API key is never exposed to the browser.

## Legal

Atlas.gg is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing League of Legends. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc.
