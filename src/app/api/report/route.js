import { NextResponse } from 'next/server';
import {
  RiotApiError,
  clamp,
  colorFromScore,
  getRegionalRoute,
  mapParticipantRole,
  msToTimestamp,
  normalizePlatformRegion,
  queueLabelFromId,
  riotFetchJson,
} from '@/lib/riot';
import { generateInsightFromContext } from '@/lib/insight-rag';

const PHASES = [
  { label: 'Early', startMs: 0, endMs: 14 * 60 * 1000 },
  { label: 'Mid', startMs: 14 * 60 * 1000, endMs: 25 * 60 * 1000 },
  { label: 'Late', startMs: 25 * 60 * 1000, endMs: Number.POSITIVE_INFINITY },
];

const GRID_SIZE = 500;
const VISION_WINDOW_MS = 90 * 1000;
const VISION_RADIUS = 1500;

function classifyMapZone(position) {
  if (!position) {
    return 'unknown zone';
  }

  const x = position.x || 0;
  const y = position.y || 0;
  const riverBand = Math.abs((x + y) - 14000) <= 1200;

  if (x < 2000 && y < 2000) {
    return 'blue base';
  }

  if (x > 12500 && y > 12500) {
    return 'red base';
  }

  if (x > 9000 && y < 6000) {
    return 'bot lane';
  }

  if (Math.abs(x - y) < 2000) {
    return 'mid lane';
  }

  if (x < 6000 && y > 9000) {
    return 'top lane';
  }

  if (x > 8000 && y < 8000 && riverBand) {
    return 'bot river';
  }

  if (x < 6000 && y > 6000 && riverBand) {
    return 'top river';
  }

  if (x < 7000 && y < 8000) {
    return 'blue jungle';
  }

  if (x > 7000 && y > 6000) {
    return 'red jungle';
  }

  return 'map edge';
}

function buildPatternFrequency(count, gamesAnalyzed) {
  if (!gamesAnalyzed) {
    return '0 of 0 games';
  }

  const normalized = Math.max(0, Math.min(count, gamesAnalyzed));
  return `${normalized} of ${gamesAnalyzed} games`;
}

function getPatternTrend(events, gamesAnalyzed) {
  if (!events.length || gamesAnalyzed < 3) {
    return 'stable';
  }

  const counts = new Array(gamesAnalyzed).fill(0);

  for (const event of events) {
    const index = Math.max(0, Math.min((event.gameNumber || 1) - 1, gamesAnalyzed - 1));
    counts[index] += 1;
  }

  const split = Math.floor(gamesAnalyzed / 2);
  const early = counts.slice(0, split);
  const late = counts.slice(split);

  const avgEarly = early.length ? (early.reduce((sum, value) => sum + value, 0) / early.length) : 0;
  const avgLate = late.length ? (late.reduce((sum, value) => sum + value, 0) / late.length) : 0;

  if (avgLate - avgEarly > 0.4) {
    return 'worsening';
  }

  if (avgEarly - avgLate > 0.4) {
    return 'improving';
  }

  return 'stable';
}

function getDominantPhase(events) {
  if (!events.length) {
    return 'Mid';
  }

  const counts = {
    Early: 0,
    Mid: 0,
    Late: 0,
  };

  for (const event of events) {
    const label = getPhaseLabel(event.timestampMs || 0);
    counts[label] += 1;
  }

  const phaseEntries = Object.entries(counts);
  phaseEntries.sort((a, b) => b[1] - a[1]);
  return phaseEntries[0][0];
}

function buildRagEventFromSample(event, noVision) {
  if (!event) {
    return {
      timestamp: '10:00',
      deathZone: 'unknown zone',
      deathCoordinates: null,
      nearestAllyDistance: null,
      enemiesNearby: null,
      visionCoverageAtDeath: noVision.count > 0
        ? 'inconsistent coverage in prior 90 seconds'
        : 'coverage unknown',
    };
  }

  return {
    timestamp: msToTimestamp(event.timestampMs),
    deathZone: classifyMapZone(event.position),
    deathCoordinates: event.position || null,
    nearestAllyDistance: null,
    enemiesNearby: null,
    visionCoverageAtDeath: noVision.count > 0
      ? 'multiple deaths with no nearby ward in prior 90 seconds'
      : 'coverage unknown',
  };
}

function getPhaseLabel(timestampMs) {
  if (timestampMs < PHASES[1].startMs) {
    return 'Early';
  }

  if (timestampMs < PHASES[2].startMs) {
    return 'Mid';
  }

  return 'Late';
}

function createPhaseAccumulator() {
  return {
    Early: { cs: 0, minutes: 0, deaths: 0, wards: 0, teamObjectives: 0, playerObjectives: 0, activeGames: 0 },
    Mid: { cs: 0, minutes: 0, deaths: 0, wards: 0, teamObjectives: 0, playerObjectives: 0, activeGames: 0 },
    Late: { cs: 0, minutes: 0, deaths: 0, wards: 0, teamObjectives: 0, playerObjectives: 0, activeGames: 0 },
  };
}

function mostCommon(values, fallback = 'Unknown') {
  if (!values.length) {
    return fallback;
  }

  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  let bestValue = fallback;
  let bestCount = -1;

  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  }

  return bestValue;
}

function euclideanDistance(a, b) {
  if (!a || !b) {
    return Number.POSITIVE_INFINITY;
  }

  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  return Math.sqrt((dx * dx) + (dy * dy));
}

function getTeamIdByParticipantId(participantId, participantTeamMap) {
  if (participantTeamMap[participantId]) {
    return participantTeamMap[participantId];
  }

  return participantId <= 5 ? 100 : 200;
}

function getFrameAtOrBefore(frames, targetTimestampMs) {
  if (!frames.length) {
    return null;
  }

  let selected = frames[0];

  for (const frame of frames) {
    if (frame.timestamp <= targetTimestampMs) {
      selected = frame;
    } else {
      break;
    }
  }

  return selected;
}

function getParticipantFrame(frame, participantId) {
  if (!frame || !frame.participantFrames) {
    return null;
  }

  return frame.participantFrames[String(participantId)] || frame.participantFrames[participantId] || null;
}

function getCsAtTimestamp(frames, participantId, timestampMs) {
  const frame = getFrameAtOrBefore(frames, timestampMs);
  const participantFrame = getParticipantFrame(frame, participantId);

  if (!participantFrame) {
    return 0;
  }

  return (participantFrame.minionsKilled || 0) + (participantFrame.jungleMinionsKilled || 0);
}

function addPhaseCsMetrics(phaseTotals, frames, participantId, gameDurationMs) {
  for (const phase of PHASES) {
    const startMs = phase.startMs;
    const endMs = Math.min(phase.endMs, gameDurationMs);

    if (endMs <= startMs) {
      continue;
    }

    const csStart = getCsAtTimestamp(frames, participantId, startMs);
    const csEnd = getCsAtTimestamp(frames, participantId, endMs);
    const csDelta = Math.max(0, csEnd - csStart);
    const minutes = (endMs - startMs) / 60000;

    phaseTotals[phase.label].cs += csDelta;
    phaseTotals[phase.label].minutes += minutes;
    phaseTotals[phase.label].activeGames += 1;
  }
}

function collectTimelineMetrics({ timeline, participant, participantTeamMap, gameNumber }) {
  const deaths = [];
  const wards = [];
  const objectiveEvents = [];
  const phaseMetrics = createPhaseAccumulator();

  if (!timeline?.info?.frames?.length) {
    return {
      deaths,
      wards,
      objectiveEvents,
      phaseMetrics,
      frames: [],
    };
  }

  const frames = timeline.info.frames;

  for (const frame of frames) {
    const events = frame.events || [];

    for (const event of events) {
      const timestampMs = event.timestamp || 0;
      const phaseLabel = getPhaseLabel(timestampMs);

      if (event.type === 'CHAMPION_KILL' && event.victimId === participant.participantId) {
        deaths.push({
          gameNumber,
          timestampMs,
          position: event.position || null,
        });

        phaseMetrics[phaseLabel].deaths += 1;
      }

      if (event.type === 'WARD_PLACED' && event.creatorId === participant.participantId) {
        wards.push({
          gameNumber,
          timestampMs,
          position: event.position || null,
        });

        phaseMetrics[phaseLabel].wards += 1;
      }

      if (
        event.type === 'ELITE_MONSTER_KILL'
        && (event.monsterType === 'DRAGON' || event.monsterType === 'BARON_NASHOR')
      ) {
        const killerId = event.killerId || 0;
        const assistingParticipantIds = Array.isArray(event.assistingParticipantIds)
          ? event.assistingParticipantIds
          : [];

        const objectiveTeamId = getTeamIdByParticipantId(killerId, participantTeamMap);

        if (objectiveTeamId === participant.teamId) {
          const playerInvolved = (
            killerId === participant.participantId
            || assistingParticipantIds.includes(participant.participantId)
          );

          objectiveEvents.push({
            gameNumber,
            timestampMs,
            position: event.position || null,
            playerInvolved,
          });

          phaseMetrics[phaseLabel].teamObjectives += 1;

          if (playerInvolved) {
            phaseMetrics[phaseLabel].playerObjectives += 1;
          }
        }
      }
    }
  }

  return {
    deaths,
    wards,
    objectiveEvents,
    phaseMetrics,
    frames,
  };
}

function countDeathsWithoutVision(deaths, wards) {
  let count = 0;
  let firstEvent = null;
  const games = new Set();

  for (const death of deaths) {
    const hasNearbyWard = wards.some((ward) => {
      if (ward.gameNumber !== death.gameNumber) {
        return false;
      }

      if (ward.timestampMs > death.timestampMs) {
        return false;
      }

      if (ward.timestampMs < (death.timestampMs - VISION_WINDOW_MS)) {
        return false;
      }

      return euclideanDistance(ward.position, death.position) <= VISION_RADIUS;
    });

    if (!hasNearbyWard) {
      count += 1;
      games.add(death.gameNumber);

      if (!firstEvent) {
        firstEvent = death;
      }
    }
  }

  return {
    count,
    games: games.size,
    firstEvent,
  };
}

function buildClusterSummary(events) {
  const cellMap = new Map();

  for (const event of events) {
    if (!event.position) {
      continue;
    }

    const xCell = Math.floor((event.position.x || 0) / GRID_SIZE);
    const yCell = Math.floor((event.position.y || 0) / GRID_SIZE);
    const key = `${xCell}:${yCell}`;

    if (!cellMap.has(key)) {
      cellMap.set(key, []);
    }

    cellMap.get(key).push(event);
  }

  let bestEvents = [];

  for (const groupedEvents of cellMap.values()) {
    if (groupedEvents.length > bestEvents.length) {
      bestEvents = groupedEvents;
    }
  }

  if (!bestEvents.length) {
    return {
      count: 0,
      games: 0,
      sample: null,
      topThreeCoveragePct: 0,
    };
  }

  const sortedCells = Array.from(cellMap.values())
    .map((groupedEvents) => groupedEvents.length)
    .sort((a, b) => b - a);

  const topThreeCount = sortedCells.slice(0, 3).reduce((sum, value) => sum + value, 0);
  const totalCount = events.length;

  const gamesSet = new Set(bestEvents.map((event) => event.gameNumber));

  return {
    count: bestEvents.length,
    games: gamesSet.size,
    sample: bestEvents[Math.floor(bestEvents.length / 2)],
    topThreeCoveragePct: totalCount > 0
      ? Math.round((topThreeCount / totalCount) * 100)
      : 0,
  };
}

function scorePhase(phase) {

    /*
    Scores a phase based on various metrics.

    Current score is a weighted combination of:
    - CS per minute (25%): Benchmarked against 7 CS/min as a strong performance.
    - Deaths per game (30%): Heavily penalizes deaths, with 3 deaths/game or more scoring near 0.
    - Objective presence (25%): Based on the player's share of team objectives in that phase.
    - Vision score (20%): Benchmarked against 0.35 wards placed per minute.
    */


  if (phase.minutes <= 0) {
    return 50;
  }

  const csPerMinute = phase.cs / phase.minutes;
  const csScore = clamp((csPerMinute / 7) * 100, 0, 100);

  const deathsPerGame = phase.activeGames > 0
    ? phase.deaths / phase.activeGames
    : phase.deaths;
  const deathScore = clamp(100 - (deathsPerGame * 30), 0, 100);

  const objectiveScore = phase.teamObjectives > 0
    ? clamp((phase.playerObjectives / phase.teamObjectives) * 100, 0, 100)
    : 50;

  const wardsPerMinute = phase.wards / phase.minutes;
  const visionScore = clamp((wardsPerMinute / 0.35) * 100, 0, 100);

  return Math.round(
    (csScore * 0.25)
    + (deathScore * 0.30)
    + (objectiveScore * 0.25)
    + (visionScore * 0.20),
  );
}

function toJumpTarget(event, fallbackGame = 1, fallbackTimestampMs = 10 * 60 * 1000) {
  if (!event) {
    return {
      game: fallbackGame,
      timestamp: msToTimestamp(fallbackTimestampMs),
    };
  }

  return {
    game: event.gameNumber,
    timestamp: msToTimestamp(event.timestampMs),
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const matchIds = Array.isArray(body?.matchIds) ? body.matchIds : [];
    const puuid = body?.puuid;
    const region = body?.region || 'NA1';

    if (!puuid) {
      return NextResponse.json(
        {
          success: false,
          message: 'puuid is required.',
        },
        { status: 400 },
      );
    }

    if (matchIds.length < 2) {
      return NextResponse.json(
        {
          success: false,
          message: 'Select at least 2 matches to build a report.',
        },
        { status: 400 },
      );
    }

    const platformRegion = normalizePlatformRegion(region);
    const regionalRoute = getRegionalRoute(platformRegion);

    const roleSamples = [];
    const queueSamples = [];
    const phaseTotals = createPhaseAccumulator();

    let totalDeaths = 0;
    let totalVisionScore = 0;
    let totalTeamObjectives = 0;
    let totalPlayerObjectives = 0;
    let totalWards = 0;

    const allDeathEvents = [];
    const allWardEvents = [];
    const allObjectiveEvents = [];

    for (let index = 0; index < matchIds.length; index += 1) {
      const matchId = matchIds[index];
      const gameNumber = index + 1;

      const match = await riotFetchJson(
        `https://${regionalRoute}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
      );

      const participant = match.info.participants.find((p) => p.puuid === puuid);

      if (!participant) {
        continue;
      }

      roleSamples.push(mapParticipantRole(participant));
      queueSamples.push(queueLabelFromId(match.info.queueId));

      totalDeaths += participant.deaths || 0;
      totalVisionScore += participant.visionScore || 0;

      const rawDuration = match.info.gameDuration || 0;
      const durationSeconds = rawDuration > 100000 ? Math.floor(rawDuration / 1000) : rawDuration;
      const gameDurationMs = Math.max(0, durationSeconds * 1000);

      const participantTeamMap = {};
      for (const p of match.info.participants) {
        participantTeamMap[p.participantId] = p.teamId;
      }

      let timeline = null;
      try {
        timeline = await riotFetchJson(
          `https://${regionalRoute}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`,
        );
      } catch (timelineError) {
        if (!(timelineError instanceof RiotApiError) || timelineError.status !== 404) {
          throw timelineError;
        }
      }

      const timelineMetrics = collectTimelineMetrics({
        timeline,
        participant,
        participantTeamMap,
        gameNumber,
      });

      addPhaseCsMetrics(
        phaseTotals,
        timelineMetrics.frames,
        participant.participantId,
        gameDurationMs,
      );

      for (const phase of PHASES) {
        phaseTotals[phase.label].deaths += timelineMetrics.phaseMetrics[phase.label].deaths;
        phaseTotals[phase.label].wards += timelineMetrics.phaseMetrics[phase.label].wards;
        phaseTotals[phase.label].teamObjectives += timelineMetrics.phaseMetrics[phase.label].teamObjectives;
        phaseTotals[phase.label].playerObjectives += timelineMetrics.phaseMetrics[phase.label].playerObjectives;
      }

      totalWards += timelineMetrics.wards.length;
      totalTeamObjectives += timelineMetrics.objectiveEvents.length;
      totalPlayerObjectives += timelineMetrics.objectiveEvents.filter((event) => event.playerInvolved).length;

      allDeathEvents.push(...timelineMetrics.deaths);
      allWardEvents.push(...timelineMetrics.wards);
      allObjectiveEvents.push(...timelineMetrics.objectiveEvents);
    }

    const gamesAnalyzed = matchIds.length;
    const avgVisionScore = gamesAnalyzed > 0 ? Math.round(totalVisionScore / gamesAnalyzed) : 0;
    const avgDeathsPerGame = gamesAnalyzed > 0 ? totalDeaths / gamesAnalyzed : 0;
    const objectivePresencePct = totalTeamObjectives > 0
      ? Math.round((totalPlayerObjectives / totalTeamObjectives) * 100)
      : 0;
    const avgWardsPerGame = gamesAnalyzed > 0
      ? Number((totalWards / gamesAnalyzed).toFixed(1))
      : 0;

    const deathCluster = buildClusterSummary(allDeathEvents);
    const wardCluster = buildClusterSummary(allWardEvents);
    const noVision = countDeathsWithoutVision(allDeathEvents, allWardEvents);

    const phaseScores = PHASES.map((phase) => {
      const score = scorePhase(phaseTotals[phase.label]);
      return {
        label: phase.label,
        pct: score,
        color: colorFromScore(score),
      };
    });

    const weakestPhase = phaseScores.reduce((lowest, phase) => {
      if (!lowest || phase.pct < lowest.pct) {
        return phase;
      }

      return lowest;
    }, null);

    const role = mostCommon(roleSamples, 'Unknown');
    const queueLabel = mostCommon(queueSamples, 'Ranked Solo');
    const dominantDeathPhase = getDominantPhase(allDeathEvents);
    const deathPatternTrend = getPatternTrend(allDeathEvents, gamesAnalyzed);

    const objectiveJump = toJumpTarget(allObjectiveEvents[0]);
    const deathJump = toJumpTarget(allDeathEvents[0]);
    const noVisionJump = toJumpTarget(noVision.firstEvent);
    const clusterJump = toJumpTarget(deathCluster.sample);

    const criticalSample = deathCluster.sample || noVision.firstEvent || allDeathEvents[0] || null;

    let criticalPatternType = 'phase_performance';
    let criticalPatternCount = gamesAnalyzed;
    let criticalFallback = `${weakestPhase?.label || 'Mid'} phase scored ${weakestPhase?.pct || 0}%. Focus on safer resets and objective timing to smooth out this dip.`;

    if (deathCluster.count >= 3) {
      criticalPatternType = 'death_cluster';
      criticalPatternCount = deathCluster.games || deathCluster.count;
      criticalFallback = `Your deaths repeatedly cluster in one map zone: ${deathCluster.count} deaths across ${deathCluster.games} games in ${classifyMapZone(deathCluster.sample?.position)}.`;
    } else if (noVision.count >= 3) {
      criticalPatternType = 'deaths_without_vision';
      criticalPatternCount = noVision.games || noVision.count;
      criticalFallback = `A large share of deaths happened without nearby vision: ${noVision.count} deaths in unwarded space over selected games.`;
    }

    const sharedRagContext = {
      playerRole: role,
      gamesAnalyzed,
      gamePhase: dominantDeathPhase,
      gameContext: {
        queueType: queueLabel,
        objectivePresencePct,
        avgVisionScore,
        avgDeathsPerGame: Number(avgDeathsPerGame.toFixed(1)),
        weakestPhase: `${weakestPhase?.label || 'Mid'} (${weakestPhase?.pct || 0}%)`,
      },
      crossGamePattern: {
        deathClusterZone: classifyMapZone(deathCluster.sample?.position),
        patternPhase: dominantDeathPhase,
        trend: deathPatternTrend,
        wardPatternCoveragePct: wardCluster.topThreeCoveragePct,
      },
    };

    const objectiveFallback = objectivePresencePct >= 50
      ? `Good objective involvement at ${objectivePresencePct}% participation.`
      : `Low objective involvement at ${objectivePresencePct}% participation across selected games.`;
    const phaseFallback = `${weakestPhase?.label || 'Mid'} phase scored ${weakestPhase?.pct || 0}%. This is currently your weakest segment.`;
    const noVisionFallback = `${noVision.count} deaths happened with no nearby ward coverage in the prior 90 seconds.`;
    const wardFallback = `${wardCluster.topThreeCoveragePct}% of wards were placed in your top 3 map cells (${avgWardsPerGame}/game).`;
    const deathClusterFallback = deathCluster.count > 0
      ? `${deathCluster.count} deaths landed in your most repeated area across ${deathCluster.games} games.`
      : 'No dominant death cluster found yet across selected matches.';
    const deathLoadFallback = `${avgDeathsPerGame.toFixed(1)} deaths per game on average across this sample.`;

    const [
      criticalGenerated,
      objectiveGenerated,
      phaseGenerated,
      noVisionGenerated,
      wardGenerated,
      deathClusterGenerated,
      deathLoadGenerated,
    ] = await Promise.all([
      generateInsightFromContext({
        contextPacket: {
          ...sharedRagContext,
          patternType: criticalPatternType,
          patternFrequency: buildPatternFrequency(criticalPatternCount, gamesAnalyzed),
          event: buildRagEventFromSample(criticalSample, noVision),
        },
        fallbackText: criticalFallback,
      }),
      generateInsightFromContext({
        contextPacket: {
          ...sharedRagContext,
          patternType: 'objective_presence',
          patternFrequency: buildPatternFrequency(new Set(allObjectiveEvents.map((event) => event.gameNumber)).size, gamesAnalyzed),
          event: buildRagEventFromSample(allObjectiveEvents[0], noVision),
        },
        fallbackText: objectiveFallback,
      }),
      generateInsightFromContext({
        contextPacket: {
          ...sharedRagContext,
          patternType: 'phase_performance',
          patternFrequency: buildPatternFrequency(gamesAnalyzed, gamesAnalyzed),
          event: buildRagEventFromSample(criticalSample, noVision),
        },
        fallbackText: phaseFallback,
      }),
      generateInsightFromContext({
        contextPacket: {
          ...sharedRagContext,
          patternType: 'deaths_without_vision',
          patternFrequency: buildPatternFrequency(noVision.games || noVision.count, gamesAnalyzed),
          event: buildRagEventFromSample(noVision.firstEvent, noVision),
        },
        fallbackText: noVisionFallback,
      }),
      generateInsightFromContext({
        contextPacket: {
          ...sharedRagContext,
          patternType: 'ward_clustering',
          patternFrequency: buildPatternFrequency(wardCluster.games || 0, gamesAnalyzed),
          event: buildRagEventFromSample(wardCluster.sample, noVision),
        },
        fallbackText: wardFallback,
      }),
      generateInsightFromContext({
        contextPacket: {
          ...sharedRagContext,
          patternType: 'death_cluster',
          patternFrequency: buildPatternFrequency(deathCluster.games || deathCluster.count, gamesAnalyzed),
          event: buildRagEventFromSample(deathCluster.sample, noVision),
        },
        fallbackText: deathClusterFallback,
      }),
      generateInsightFromContext({
        contextPacket: {
          ...sharedRagContext,
          patternType: 'overextension',
          patternFrequency: buildPatternFrequency(new Set(allDeathEvents.map((event) => event.gameNumber)).size, gamesAnalyzed),
          event: buildRagEventFromSample(allDeathEvents[0], noVision),
        },
        fallbackText: deathLoadFallback,
      }),
    ]);

    const criticalJump = toJumpTarget(criticalSample || allDeathEvents[0]);

    const criticalInsight = {
      text: criticalGenerated.text,
      highlight: '',
      text2: '',
      timestamp: criticalJump.timestamp,
      game: criticalJump.game,
    };

    const ragSources = [
      criticalGenerated.source,
      objectiveGenerated.source,
      phaseGenerated.source,
      noVisionGenerated.source,
      wardGenerated.source,
      deathClusterGenerated.source,
      deathLoadGenerated.source,
    ];
    
    let ragMode = 'retrieval-fallback';
    if (ragSources.includes('anthropic-rag')) {
      ragMode = 'anthropic-rag';
    } else if (ragSources.includes('gemini-rag')) {
      ragMode = 'gemini-rag';
    } else if (ragSources.includes('openai-rag')) {
      ragMode = 'openai-rag';
    }

    const report = {
      role,
      queueLabel,
      gamesAnalyzed,
      criticalInsight,
      stats: [
        {
          label: 'Deaths',
          value: String(totalDeaths),
          sub: `across ${gamesAnalyzed} games`,
          color: 'red',
        },
        {
          label: 'Vision score',
          value: String(avgVisionScore),
          sub: 'avg per game',
          color: 'amber',
        },
        {
          label: 'Obj. presence',
          value: `${objectivePresencePct}%`,
          sub: 'dragon / baron',
          color: 'blue',
        },
      ],
      phases: phaseScores,
      sections: [
        {
          id: 'macro',
          label: 'Macro',
          color: 'red',
          cards: [
            {
              title: 'Objective presence',
              text: objectiveGenerated.text,
              timestamp: objectiveJump.timestamp,
              game: objectiveJump.game,
            },
            {
              title: `${weakestPhase?.label || 'Mid'} phase drop`,
              text: phaseGenerated.text,
              timestamp: criticalInsight.timestamp,
              game: criticalInsight.game,
            },
          ],
        },
        {
          id: 'vision',
          label: 'Vision',
          color: 'amber',
          cards: [
            {
              title: 'Deaths without vision',
              text: noVisionGenerated.text,
              timestamp: noVisionJump.timestamp,
              game: noVisionJump.game,
            },
            {
              title: 'Ward clustering',
              text: wardGenerated.text,
              timestamp: objectiveJump.timestamp,
              game: objectiveJump.game,
            },
          ],
        },
        {
          id: 'positioning',
          label: 'Positioning',
          color: 'blue',
          cards: [
            {
              title: 'Death clustering',
              text: deathClusterGenerated.text,
              timestamp: clusterJump.timestamp,
              game: clusterJump.game,
            },
            {
              title: 'Death load',
              text: deathLoadGenerated.text,
              timestamp: deathJump.timestamp,
              game: deathJump.game,
            },
          ],
        },
      ],
      rag: {
        mode: ragMode,
        sources: ragSources,
      },
    };

    return NextResponse.json({
      success: true,
      report,
      platformRegion,
      regionalRoute,
    });
  } catch (error) {
    if (error instanceof RiotApiError) {
      if (error.status === 429) {
        return NextResponse.json(
          {
            success: false,
            message: 'Riot API rate limit reached while generating report.',
          },
          { status: 429 },
        );
      }

      return NextResponse.json(
        {
          success: false,
          message: error.message,
        },
        { status: error.status || 500 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: 'Unexpected error while generating report.',
      },
      { status: 500 },
    );
  }
}
