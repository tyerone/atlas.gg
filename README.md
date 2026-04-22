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

Optional for RAG-generated coaching text:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL` (defaults to `claude-sonnet-4-20250514`)
- `OPENAI_API_KEY` (ChatGPT backup provider)
- `OPENAI_MODEL` (defaults to `gpt-4.1-mini`)

3. Run the dev server:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## Implemented Riot API Flows

- `POST /api/connect`: Riot ID + platform region to PUUID
- `GET /api/matches`: latest matches for a PUUID
- `POST /api/report`: report statistics computed from selected matches + timelines

## Insights + RAG

- Rule-based pattern detection still computes the factual signals (deaths, vision gaps, clustering, phase scores).
- RAG layer assembles a context packet per insight card and retrieves coaching context from a role-aware knowledge base.
- If `ANTHROPIC_API_KEY` is present, report insights are generated through Anthropic with retrieval-augmented context.
- If Anthropic is unavailable and `OPENAI_API_KEY` is present, the API uses OpenAI (ChatGPT) as backup.
- If neither provider is available, the API uses retrieval-guided fallback text (no hard failure).

Riot API calls are executed server-side. The API key is never exposed to the browser.

## Legal

Atlas.gg is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing League of Legends. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc.
