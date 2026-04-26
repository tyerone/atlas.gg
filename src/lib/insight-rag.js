const RAG_SYSTEM_PROMPT = `You are a League of Legends performance coach analyzing replay data for competitive university esports teams and ranked solo players.

Given a structured context packet about a detected gameplay pattern, generate a concise, actionable insight card in plain English.

Rules:
- Write 2-3 sentences maximum. Be specific and direct.
- Reference actual timestamps, coordinate zones, and game-state facts from context. Never invent details not in context.
- If context suggests the play was justified, acknowledge it.
- End with one concrete behavioral suggestion the player can act on.
- No jargon-heavy dump, no JSON, no markdown, no headers.
- Tone: direct, analytical, supportive.`;

const PRO_ROLE_BENCHMARKS = {
  Top: {
    objectivePresencePct: 52,
    phaseCsPerMinute: { Early: 6.4, Mid: 6.8, Late: 6.5 },
    visionActionsPerMinute: 0.24,
    safeIsolationUnits: 3200,
  },
  Jungle: {
    objectivePresencePct: 72,
    phaseCsPerMinute: { Early: 5.0, Mid: 5.8, Late: 5.5 },
    visionActionsPerMinute: 0.36,
    safeIsolationUnits: 2800,
  },
  Mid: {
    objectivePresencePct: 60,
    phaseCsPerMinute: { Early: 7.1, Mid: 7.5, Late: 7.2 },
    visionActionsPerMinute: 0.29,
    safeIsolationUnits: 3000,
  },
  ADC: {
    objectivePresencePct: 62,
    phaseCsPerMinute: { Early: 7.2, Mid: 7.6, Late: 7.4 },
    visionActionsPerMinute: 0.30,
    safeIsolationUnits: 3000,
  },
  Support: {
    objectivePresencePct: 66,
    phaseCsPerMinute: { Early: 1.2, Mid: 1.5, Late: 1.6 },
    visionActionsPerMinute: 0.55,
    safeIsolationUnits: 2600,
  },
};

const DEFAULT_BENCHMARKS = {
  objectivePresencePct: 60,
  phaseCsPerMinute: { Early: 6.5, Mid: 7.0, Late: 6.8 },
  visionActionsPerMinute: 0.30,
  safeIsolationUnits: 3000,
};

const COACHING_KNOWLEDGE_BASE = [
  {
    id: 'overextension-river-checklist',
    patternType: 'overextension',
    roles: ['Top', 'Mid', 'ADC'],
    phases: ['Mid', 'Late'],
    tags: ['river', 'isolation', 'vision', 'jungler tracking'],
    coachingPoint: 'Before crossing river, confirm two conditions: nearest ally pathing toward you and at least one recent enemy-jungle information point.',
  },
  {
    id: 'death-cluster-reset-angle',
    patternType: 'death_cluster',
    roles: ['Top', 'Jungle', 'Mid', 'ADC', 'Support'],
    phases: ['Early', 'Mid', 'Late'],
    tags: ['cluster', 'repeat location', 'pathing'],
    coachingPoint: 'Repeated deaths in one zone usually indicate pathing habit, not mechanics; vary your entry angle and reset timing around that location.',
  },
  {
    id: 'vision-before-contest',
    patternType: 'deaths_without_vision',
    roles: ['Top', 'Jungle', 'Mid', 'ADC', 'Support'],
    phases: ['Mid', 'Late'],
    tags: ['vision', 'ward coverage', 'objective'],
    coachingPoint: 'If no ward has been placed in your intended contest area within the last 90 seconds, treat the fight as low-information and delay commit.',
  },
  {
    id: 'ward-diversification',
    patternType: 'ward_clustering',
    roles: ['Jungle', 'Support', 'Mid', 'ADC'],
    phases: ['Mid', 'Late'],
    tags: ['wards', 'predictable', 'map control'],
    coachingPoint: 'Diversify ward cells around objective setups so enemy supports cannot pre-clear your default vision pattern.',
  },
  {
    id: 'objective-presence',
    patternType: 'objective_presence',
    roles: ['Top', 'Jungle', 'Mid', 'ADC', 'Support'],
    phases: ['Mid', 'Late'],
    tags: ['dragon', 'baron', 'rotation'],
    coachingPoint: 'Anchor your reset and wave timing to objective windows: arrive 45-60 seconds early with lane priority, not on spawn.',
  },
  {
    id: 'phase-collapse',
    patternType: 'phase_performance',
    roles: ['Top', 'Jungle', 'Mid', 'ADC', 'Support'],
    phases: ['Early', 'Mid', 'Late'],
    tags: ['phase score', 'consistency'],
    coachingPoint: 'When one phase repeatedly underperforms, set a single phase-specific rule for the next block and measure it over 5 games.',
  },
];

const insightCache = new Map();

function tokenize(text) {
  if (!text) {
    return [];
  }

  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function toPhrase(value) {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function buildSignals(contextPacket) {
  const signals = [
    contextPacket.patternType,
    contextPacket.playerRole,
    contextPacket.gamePhase,
    contextPacket.patternFrequency,
    toPhrase(contextPacket.event?.deathZone),
    toPhrase(contextPacket.event?.visionCoverageAtDeath),
    toPhrase(contextPacket.crossGamePattern?.patternPhase),
    toPhrase(contextPacket.crossGamePattern?.trend),
  ];

  return tokenize(signals.join(' '));
}

function getRoleBenchmark(role) {
  return PRO_ROLE_BENCHMARKS[role] || DEFAULT_BENCHMARKS;
}

function scoreDoc(doc, contextPacket, queryTokens) {
  let score = 0;

  if (doc.patternType === contextPacket.patternType) {
    score += 8;
  }

  if (doc.roles.includes(contextPacket.playerRole)) {
    score += 5;
  }

  if (doc.phases.some((phase) => String(contextPacket.gamePhase || '').includes(phase))) {
    score += 2;
  }

  const docTokens = new Set(tokenize(`${doc.tags.join(' ')} ${doc.coachingPoint}`));
  for (const token of queryTokens) {
    if (docTokens.has(token)) {
      score += 1;
    }
  }

  return score;
}

export function retrieveCoachingContext(contextPacket, limit = 3) {
  const queryTokens = buildSignals(contextPacket);

  const ranked = COACHING_KNOWLEDGE_BASE
    .map((doc) => ({
      ...doc,
      score: scoreDoc(doc, contextPacket, queryTokens),
    }))
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return ranked.map((doc) => ({
    id: doc.id,
    coachingPoint: doc.coachingPoint,
    tags: doc.tags,
  }));
}

function sentenceCap(text, maxSentences = 3) {
  const parts = String(text)
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, maxSentences);

  return parts.join(' ').trim();
}

function fallbackInsight(fallbackText, retrieved) {
  const base = sentenceCap(fallbackText, 2);

  if (!retrieved.length) {
    return base;
  }

  const tip = retrieved[0].coachingPoint;
  if (!tip) {
    return base;
  }

  const joined = `${base} ${tip}`.trim();
  return sentenceCap(joined, 3);
}

function sanitizeGenerated(text, fallbackText, retrieved) {
  const trimmed = String(text || '').trim();

  if (!trimmed) {
    return fallbackInsight(fallbackText, retrieved);
  }

  return sentenceCap(trimmed, 3);
}

async function callAnthropic(contextPacket, retrievedContext) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 260,
        system: RAG_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              contextPacket,
              retrievedContext,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const first = Array.isArray(data?.content) ? data.content[0] : null;

    if (!first || typeof first.text !== 'string') {
      return null;
    }

    return first.text;
  } catch {
    return null;
  }
}

// GEMINI API KEY CALL 
async function callGemini(contextPacket, retrievedContext) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: RAG_SYSTEM_PROMPT }] },
          contents: [
            {
              role: 'user',
              parts: [{ text: JSON.stringify({ contextPacket, retrievedContext }) }],
            },
          ],
          generationConfig: { maxOutputTokens: 260, temperature: 0.3 },
        }),
      },
    );

    if (!response.ok) return null;

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  }
}

function readOpenAIContent(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const parts = content
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }

      if (item?.type === 'text' && typeof item.text === 'string') {
        return item.text;
      }

      return '';
    })
    .filter(Boolean);

  if (!parts.length) {
    return null;
  }

  return parts.join(' ').trim();
}

async function callOpenAI(contextPacket, retrievedContext) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        max_tokens: 260,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: RAG_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: JSON.stringify({
              contextPacket,
              retrievedContext,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const content = readOpenAIContent(data?.choices?.[0]?.message?.content);

    if (!content) {
      return null;
    }

    return content;
  } catch {
    return null;
  }
}

export async function generateInsightFromContext({ contextPacket, fallbackText }) {
  const cacheKey = JSON.stringify({ contextPacket, fallbackText });
  if (insightCache.has(cacheKey)) {
    return insightCache.get(cacheKey);
  }

  const retrievedContext = retrieveCoachingContext(contextPacket, 3);
  const enrichedPacket = { ...contextPacket, roleBenchmarks: getRoleBenchmark(contextPacket.playerRole) };

  const anthropicText = await callAnthropic(enrichedPacket, retrievedContext);
  const geminiText    = anthropicText ? null : await callGemini(enrichedPacket, retrievedContext);
  const openAiText    = anthropicText || geminiText ? null : await callOpenAI(enrichedPacket, retrievedContext);
  const llmText       = anthropicText || geminiText || openAiText;

  const text = sanitizeGenerated(llmText, fallbackText, retrievedContext);

  const result = {
    text,
    source: anthropicText ? 'anthropic-rag'
          : geminiText    ? 'gemini-rag'
          : openAiText    ? 'openai-rag'
          : 'retrieval-fallback',
    retrievedContext,
  };

  insightCache.set(cacheKey, result);
  return result;
}