const PLATFORM_REGION_ALIASES = {
  EUNE1: 'EUN1',
  OCE1: 'OC1',
};

const PLATFORM_TO_REGIONAL_ROUTE = {
  BR1: 'americas',
  LA1: 'americas',
  LA2: 'americas',
  NA1: 'americas',
  EUN1: 'europe',
  EUW1: 'europe',
  RU: 'europe',
  TR1: 'europe',
  JP1: 'asia',
  KR: 'asia',
  OC1: 'sea',
  PH2: 'sea',
  SG2: 'sea',
  TH2: 'sea',
  TW2: 'sea',
  VN2: 'sea',
};

const QUEUE_LABELS = {
  400: 'Normal Draft',
  420: 'Ranked Solo',
  430: 'Normal Blind',
  440: 'Flex',
  450: 'ARAM',
  700: 'Clash',
  900: 'ARURF',
  1700: 'Arena',
};

export class RiotApiError extends Error {
  constructor(message, status = 500, details = '') {
    super(message);
    this.name = 'RiotApiError';
    this.status = status;
    this.details = details;
  }
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizePlatformRegion(region) {
  const normalized = (region || 'NA1').trim().toUpperCase();
  return PLATFORM_REGION_ALIASES[normalized] || normalized;
}

export function getRegionalRoute(platformRegion) {
  const normalizedPlatform = normalizePlatformRegion(platformRegion);
  return PLATFORM_TO_REGIONAL_ROUTE[normalizedPlatform] || 'americas';
}

export function parseRiotId(riotId) {
  if (typeof riotId !== 'string') {
    return null;
  }

  const trimmed = riotId.trim();
  const hashIndex = trimmed.lastIndexOf('#');

  if (hashIndex <= 0 || hashIndex === trimmed.length - 1) {
    return null;
  }

  return {
    gameName: trimmed.slice(0, hashIndex),
    tagLine: trimmed.slice(hashIndex + 1),
  };
}

export async function riotFetchJson(url, init = {}) {
  const token = process.env.RIOT_API_KEY;

  if (!token) {
    throw new RiotApiError('RIOT_API_KEY is missing in the server environment.', 500);
  }

  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: {
      'X-Riot-Token': token,
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    let details = '';

    try {
      details = await response.text();
    } catch {
      details = '';
    }

    throw new RiotApiError(`Riot API request failed with status ${response.status}.`, response.status, details);
  }

  return response.json();
}

export function queueLabelFromId(queueId) {
  if (QUEUE_LABELS[queueId]) {
    return QUEUE_LABELS[queueId];
  }

  return `Queue ${queueId}`;
}

export function formatMatchDuration(rawDuration) {
  const seconds = rawDuration > 100000 ? Math.floor(rawDuration / 1000) : rawDuration;
  const minutes = Math.max(1, Math.floor(seconds / 60));
  return `${minutes}m`;
}

export function mapParticipantRole(participant) {
  const rawPosition = (
    participant.teamPosition
    || participant.individualPosition
    || participant.role
    || participant.lane
    || ''
  ).toUpperCase();

  if (rawPosition === 'TOP') {
    return 'Top';
  }

  if (rawPosition === 'JUNGLE') {
    return 'Jungle';
  }

  if (rawPosition === 'MIDDLE' || rawPosition === 'MID') {
    return 'Mid';
  }

  if (rawPosition === 'BOTTOM' || rawPosition === 'BOT' || rawPosition === 'DUO_CARRY') {
    return 'ADC';
  }

  if (rawPosition === 'UTILITY' || rawPosition === 'SUPPORT' || rawPosition === 'DUO_SUPPORT') {
    return 'Support';
  }

  return 'Unknown';
}

export function getParticipantCs(participant) {
  return (participant.totalMinionsKilled || 0) + (participant.neutralMinionsKilled || 0);
}

export function formatKda(participant) {
  return `${participant.kills || 0}/${participant.deaths || 0}/${participant.assists || 0}`;
}

export function msToTimestamp(timestampMs) {
  const totalSeconds = Math.max(0, Math.floor(timestampMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function colorFromScore(score) {
  if (score >= 60) {
    return 'blue';
  }

  if (score >= 40) {
    return 'amber';
  }

  return 'red';
}
