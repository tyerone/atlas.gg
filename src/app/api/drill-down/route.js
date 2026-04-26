import { NextResponse } from 'next/server';
import {
  RiotApiError,
  colorFromScore,
  clamp,
  formatKda,
  getRegionalRoute,
  mapParticipantRole,
  msToTimestamp,
  normalizePlatformRegion,
  queueLabelFromId,
  riotFetchJson,
} from '@/lib/riot';
import { generateInsightFromContext } from '@/lib/insight-rag';

// ─── CONSTANTS ───────────────────────────────────────────────
const PHASES = [
  { label: 'Early', startMs: 0,            endMs: 14 * 60 * 1000 },
  { label: 'Mid',   startMs: 14 * 60 * 1000, endMs: 25 * 60 * 1000 },
  { label: 'Late',  startMs: 25 * 60 * 1000, endMs: Number.POSITIVE_INFINITY },
];

const VISION_WINDOW_MS = 90 * 1000;
const VISION_RADIUS    = 1500;
const WARD_DURATION_MS = 90 * 1000; // approximate ward lifespan for display

// ─── HELPERS ─────────────────────────────────────────────────
function getPhaseLabel(timestampMs) {
  if (timestampMs < PHASES[1].startMs) return 'Early';
  if (timestampMs < PHASES[2].startMs) return 'Mid';
  return 'Late';
}

function euclideanDistance(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function getFrameAtOrBefore(frames, targetMs) {
  let selected = frames[0];
  for (const frame of frames) {
    if (frame.timestamp <= targetMs) selected = frame;
    else break;
  }
  return selected;
}

function getCsAtTimestamp(frames, participantId, timestampMs) {
  const frame = getFrameAtOrBefore(frames, timestampMs);
  const pf = frame?.participantFrames?.[String(participantId)]
          || frame?.participantFrames?.[participantId];
  if (!pf) return 0;
  return (pf.minionsKilled || 0) + (pf.jungleMinionsKilled || 0);
}

function scorePhase(phase) {
  if (phase.minutes <= 0) return 50;
  const csPerMin    = phase.cs / phase.minutes;
  const csScore     = clamp((csPerMin / 7) * 100, 0, 100);
  const deathScore  = clamp(100 - (phase.deaths * 25), 0, 100);
  const objScore    = phase.teamObjectives > 0
    ? clamp((phase.playerObjectives / phase.teamObjectives) * 100, 0, 100)
    : 50;
  const wardScore   = clamp((phase.wards / Math.max(phase.minutes, 1) / 0.35) * 100, 0, 100);
  return Math.round(csScore * 0.25 + deathScore * 0.30 + objScore * 0.25 + wardScore * 0.20);
}

// ─── COORDINATE MAPPING ──────────────────────────────────────
// Riot uses 0–14870 on both axes (roughly). Map to SVG viewBox 0–300 x 0–240.
// Riot Y axis is inverted (0 = bottom-left), SVG Y grows downward.
const RIOT_MAX   = 14870;
const SVG_W      = 300;
const SVG_H      = 240;
const SVG_PAD    = 12;

function riotToSvg(position) {
  if (!position) return null;
  const x = SVG_PAD + ((position.x || 0) / RIOT_MAX) * (SVG_W - SVG_PAD * 2);
  const y = (SVG_H - SVG_PAD) - ((position.y || 0) / RIOT_MAX) * (SVG_H - SVG_PAD * 2);
  return { x: Math.round(x), y: Math.round(y) };
}

// ─── SNAPSHOT BUILDER ────────────────────────────────────────
function buildSnapshot(timestampMs, frames, participantId, participantTeamMap, allDeaths, allWards) {
  const frame = frames.length ? getFrameAtOrBefore(frames, timestampMs) : null;

  // Player position
  const pf = frame?.participantFrames?.[String(participantId)]
           || frame?.participantFrames?.[participantId];
  const playerPos = riotToSvg(pf?.position);

  // Ally and enemy positions
  const allies  = [];
  const enemies = [];
  if (frame?.participantFrames) {
    for (const [idStr, participantFrame] of Object.entries(frame.participantFrames)) {
      const id = Number(idStr);
      if (id === participantId) continue;
      const teamId = participantTeamMap[id] || (id <= 5 ? 100 : 200);
      const myTeam = participantTeamMap[participantId] || (participantId <= 5 ? 100 : 200);
      const svgPos = riotToSvg(participantFrame?.position);
      if (!svgPos) continue;
      if (teamId === myTeam) allies.push(svgPos);
      else enemies.push(svgPos);
    }
  }

  // Active wards near this timestamp
  const activeWards = allWards
    .filter(w =>
      w.timestampMs <= timestampMs &&
      w.timestampMs >= timestampMs - WARD_DURATION_MS
    )
    .map(w => riotToSvg(w.position))
    .filter(Boolean);

  // Deaths at or near this timestamp (within 30s)
  const nearbyDeaths = allDeaths
    .filter(d => Math.abs(d.timestampMs - timestampMs) <= 30_000)
    .map(d => riotToSvg(d.position))
    .filter(Boolean);

  return {
    timestampMs,
    timestamp: msToTimestamp(timestampMs),
    player:      playerPos,
    allies,
    enemies,
    wards:       activeWards,
    deaths:      nearbyDeaths,
  };
}

// ─── ROUTE ───────────────────────────────────────────────────
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const matchId  = searchParams.get('matchId');
    const puuid    = searchParams.get('puuid');
    const region   = searchParams.get('region') || 'NA1';
    const gameNum  = Number.parseInt(searchParams.get('gameNumber') || '1', 10);

    if (!matchId || !puuid) {
      return NextResponse.json(
        { success: false, message: 'matchId and puuid are required.' },
        { status: 400 },
      );
    }

    const platformRegion = normalizePlatformRegion(region);
    const regionalRoute  = getRegionalRoute(platformRegion);

    // ── Fetch match + timeline ──────────────────────────────
    const [match, timeline] = await Promise.all([
      riotFetchJson(
        `https://${regionalRoute}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
      ),
      riotFetchJson(
        `https://${regionalRoute}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`,
      ).catch(() => null),
    ]);

    const participant = match.info.participants.find(p => p.puuid === puuid);
    if (!participant) {
      return NextResponse.json(
        { success: false, message: 'Participant not found in this match.' },
        { status: 404 },
      );
    }

    const participantTeamMap = {};
    for (const p of match.info.participants) {
      participantTeamMap[p.participantId] = p.teamId;
    }

    const rawDuration    = match.info.gameDuration || 0;
    const durationSeconds = rawDuration > 100000 ? Math.floor(rawDuration / 1000) : rawDuration;
    const gameDurationMs  = durationSeconds * 1000;

    // ── Parse timeline events ───────────────────────────────
    const deaths          = [];
    const wards           = [];
    const objectiveEvents = [];
    const frames          = timeline?.info?.frames || [];

    const phaseAcc = {
      Early: { cs: 0, minutes: 0, deaths: 0, wards: 0, teamObjectives: 0, playerObjectives: 0 },
      Mid:   { cs: 0, minutes: 0, deaths: 0, wards: 0, teamObjectives: 0, playerObjectives: 0 },
      Late:  { cs: 0, minutes: 0, deaths: 0, wards: 0, teamObjectives: 0, playerObjectives: 0 },
    };

    for (const frame of frames) {
      for (const event of frame.events || []) {
        const tsMs  = event.timestamp || 0;
        const phase = getPhaseLabel(tsMs);

        if (event.type === 'CHAMPION_KILL' && event.victimId === participant.participantId) {
          deaths.push({ timestampMs: tsMs, position: event.position || null });
          phaseAcc[phase].deaths += 1;
        }

        if (event.type === 'WARD_PLACED' && event.creatorId === participant.participantId) {
          wards.push({ timestampMs: tsMs, position: event.position || null });
          phaseAcc[phase].wards += 1;
        }

        if (
          event.type === 'ELITE_MONSTER_KILL' &&
          (event.monsterType === 'DRAGON' || event.monsterType === 'BARON_NASHOR')
        ) {
          const killerId   = event.killerId || 0;
          const assists    = Array.isArray(event.assistingParticipantIds) ? event.assistingParticipantIds : [];
          const objTeamId  = participantTeamMap[killerId] || (killerId <= 5 ? 100 : 200);
          const myTeamId   = participant.teamId;

          if (objTeamId === myTeamId) {
            const involved = killerId === participant.participantId || assists.includes(participant.participantId);
            objectiveEvents.push({ timestampMs: tsMs, position: event.position || null, involved });
            phaseAcc[phase].teamObjectives  += 1;
            if (involved) phaseAcc[phase].playerObjectives += 1;
          }
        }
      }
    }
    // CS per phase
    for (const phase of PHASES) {
      const startMs = phase.startMs;
      const endMs   = Math.min(phase.endMs, gameDurationMs);
      if (endMs <= startMs) continue;
      const csStart = getCsAtTimestamp(frames, participant.participantId, startMs);
      const csEnd   = getCsAtTimestamp(frames, participant.participantId, endMs);
      phaseAcc[phase.label].cs      = Math.max(0, csEnd - csStart);
      phaseAcc[phase.label].minutes = (endMs - startMs) / 60000;
    }

    // ── Phase scores ────────────────────────────────────────
    const phaseScores = PHASES.map(phase => ({
      label: phase.label,
      pct:   scorePhase(phaseAcc[phase.label]),
      color: colorFromScore(scorePhase(phaseAcc[phase.label])),
    }));

    // ── Deaths without vision ───────────────────────────────
    const deathsWithoutVision = deaths.filter(death =>
      !wards.some(ward =>
        ward.timestampMs <= death.timestampMs &&
        ward.timestampMs >= death.timestampMs - VISION_WINDOW_MS &&
        euclideanDistance(ward.position, death.position) <= VISION_RADIUS,
      ),
    );

    // ── Snapshots for each death + objective event ──────────
    const snapshotTimestamps = [
      ...deaths.map(d => d.timestampMs),
      ...objectiveEvents.map(e => e.timestampMs),
      ...wards.map(w => w.timestampMs),
      10 * 60 * 1000,
      18 * 60 * 1000,
      28 * 60 * 1000,
    ].sort((a, b) => a - b);

    const snapshots = {};
    for (const tsMs of snapshotTimestamps) {
      const ts = msToTimestamp(tsMs);
      if (!snapshots[ts]) {
        snapshots[ts] = buildSnapshot(tsMs, frames, participant.participantId, participantTeamMap, deaths, wards);
      }
    }

    // ── Default snapshot (first death or 10:00) ─────────────
    const defaultSnapshotMs = deaths[0]?.timestampMs || 10 * 60 * 1000;
    const defaultSnapshot   = buildSnapshot(defaultSnapshotMs, frames, participant.participantId, participantTeamMap, deaths, wards);

    // ── All-game snapshot (full death + ward positions) ──────
    const allGameSnapshot = {
      player:  null,
      allies:  [],
      enemies: [],
      wards:   wards.map(w => riotToSvg(w.position)).filter(Boolean),
      deaths:  deaths.map(d => riotToSvg(d.position)).filter(Boolean),
    };

    // ── Basic stats ─────────────────────────────────────────
    const totalCs     = (participant.totalMinionsKilled || 0) + (participant.neutralMinionsKilled || 0);
    const csPerMin    = durationSeconds > 0 ? Number((totalCs / (durationSeconds / 60)).toFixed(1)) : 0;
    const role        = mapParticipantRole(participant);
    const kda         = formatKda(participant);
    const queue       = queueLabelFromId(match.info.queueId);
    const durationMin = `${Math.floor(durationSeconds / 60)}m`;

    // ── Gemini insight cards ─────────────────────────────────
    const sharedContext = {
      playerRole:   role,
      gamesAnalyzed: 1,
      gamePhase:    'Mid',
      gameContext: {
        queueType:            queue,
        avgVisionScore:       participant.visionScore || 0,
        avgDeathsPerGame:     participant.deaths || 0,
        objectivePresencePct: objectiveEvents.length > 0
          ? Math.round((objectiveEvents.filter(e => e.involved).length / objectiveEvents.length) * 100)
          : 0,
      },
      crossGamePattern: {
        deathClusterZone: deaths[0] ? 'river zone' : 'unknown',
        patternPhase:     'Mid',
        trend:            'stable',
        wardPatternCoveragePct: 0,
      },
    };

    const firstDeath   = deaths[0];
    const firstNoVis   = deathsWithoutVision[0];
    const firstObj     = objectiveEvents[0];

    function eventContext(event) {
      return {
        timestamp:              event ? msToTimestamp(event.timestampMs) : '10:00',
        deathZone:              'river zone',
        deathCoordinates:       event?.position || null,
        nearestAllyDistance:    null,
        enemiesNearby:          null,
        visionCoverageAtDeath:  deathsWithoutVision.length > 0
          ? 'multiple deaths without nearby ward coverage'
          : 'ward coverage present',
      };
    }

    const [
      positioningInsight,
      visionInsight,
      macroInsight,
    ] = await Promise.all([
      generateInsightFromContext({
        contextPacket: {
          ...sharedContext,
          patternType:      'death_cluster',
          patternFrequency: `${deaths.length} deaths this game`,
          event:            eventContext(firstDeath),
        },
        fallbackText: deaths.length > 0
          ? `${deaths.length} deaths recorded this game. Focus on positioning relative to vision coverage before committing to fights.`
          : 'Clean game with no tracked deaths.',
      }),
      generateInsightFromContext({
        contextPacket: {
          ...sharedContext,
          patternType:      'deaths_without_vision',
          patternFrequency: `${deathsWithoutVision.length} of ${deaths.length} deaths`,
          event:            eventContext(firstNoVis || firstDeath),
        },
        fallbackText: deathsWithoutVision.length > 0
          ? `${deathsWithoutVision.length} of ${deaths.length} deaths occurred without nearby ward coverage. Place wards 90 seconds before expected fights.`
          : `Good vision discipline this game — deaths were covered by ward placement.`,
      }),
      generateInsightFromContext({
        contextPacket: {
          ...sharedContext,
          patternType:      'objective_presence',
          patternFrequency: `${objectiveEvents.filter(e => e.involved).length} of ${objectiveEvents.length} objectives`,
          event:            eventContext(firstObj),
        },
        fallbackText: objectiveEvents.length > 0
          ? `Present for ${objectiveEvents.filter(e => e.involved).length} of ${objectiveEvents.length} team objectives this game.`
          : 'No team objective events tracked this game.',
      }),
    ]);

    // ── Build tab cards ──────────────────────────────────────
    const positioningCards = deaths.map((death, i) => ({
      title:       `Death ${i + 1}`,
      text:        i === 0 ? positioningInsight.text : `Death at ${msToTimestamp(death.timestampMs)} — review positioning relative to nearby allies and vision.`,
      timestamp:   msToTimestamp(death.timestampMs),
      timestampMs: death.timestampMs,
      highlighted: i === 0,
    }));

    if (positioningCards.length === 0) {
      positioningCards.push({
        title:       'No deaths',
        text:        positioningInsight.text,
        timestamp:   '00:00',
        timestampMs: 0,
        highlighted: false,
      });
    }

    const visionCards = [];

    for (let i = 0; i < deathsWithoutVision.length; i++) {
      const death = deathsWithoutVision[i];
      visionCards.push({
        title:       `Death without vision ${i + 1}`,
        text:        i === 0 ? visionInsight.text : `Death at ${msToTimestamp(death.timestampMs)} — no ward coverage within 1500 units in prior 90 seconds.`,
        timestamp:   msToTimestamp(death.timestampMs),
        timestampMs: death.timestampMs,
        highlighted: i === 0,
      });
    }

    for (let i = 0; i < Math.min(wards.length, 3); i++) {
      const ward = wards[i];
      visionCards.push({
        title:       `Ward placed`,
        text:        `Ward placed at ${msToTimestamp(ward.timestampMs)} — click to see coverage area on map.`,
        timestamp:   msToTimestamp(ward.timestampMs),
        timestampMs: ward.timestampMs,
        highlighted: false,
      });
    }

    if (visionCards.length === 0) {
      visionCards.push({
        title:       'Vision coverage',
        text:        visionInsight.text,
        timestamp:   '05:00',
        timestampMs: 5 * 60 * 1000,
        highlighted: false,
      });
    }

    const macroCards = [];

    for (let i = 0; i < objectiveEvents.length; i++) {
      const obj = objectiveEvents[i];
      macroCards.push({
        title:       obj.involved ? 'Objective secured' : 'Objective missed',
        text:        i === 0 ? macroInsight.text : `${obj.involved ? 'Present for' : 'Absent from'} objective at ${msToTimestamp(obj.timestampMs)}.`,
        timestamp:   msToTimestamp(obj.timestampMs),
        timestampMs: obj.timestampMs,
        highlighted: !obj.involved,
      });
    }

    for (const phase of phaseScores) {
      macroCards.push({
        title:       `${phase.label} phase — ${phase.pct}%`,
        text:        `${phase.label} phase scored ${phase.pct}%. ${phase.pct < 40 ? 'This is your weakest segment this game — focus on CS consistency and death reduction.' : phase.pct < 60 ? 'Room to improve — review objective timing and reset decisions.' : 'Strong phase — maintain this standard.'}`,
        timestamp:   phase.label === 'Early' ? '10:00' : phase.label === 'Mid' ? '18:00' : '28:00',
        timestampMs: phase.label === 'Early' ? 10 * 60 * 1000 : phase.label === 'Mid' ? 18 * 60 * 1000 : 28 * 60 * 1000,
        highlighted: phase.pct < 40,
      });
    }

    if (macroCards.length === 0) {
      macroCards.push({
        title:       'Macro',
        text:        macroInsight.text,
        timestamp:   '20:00',
        timestampMs: 20 * 60 * 1000,
        highlighted: false,
      });
    }

    // ── Why you're here (first death or first notable event) ─
    const whyEvent  = firstDeath || firstNoVis || objectiveEvents[0];
    const whyTs     = whyEvent ? msToTimestamp(whyEvent.timestampMs) : '10:00';
    const whyIsVision = !firstDeath && firstNoVis;

    const whyHere = {
      pattern:   firstDeath ? `Death at ${whyTs}` : whyIsVision ? `Unvision death at ${whyTs}` : `Objective at ${whyTs}`,
      desc:      positioningCards[0]?.text || 'Review this game for positioning and vision patterns.',
      timestamp: whyTs,
    };

    return NextResponse.json({
      success: true,
      game: {
        gameNum,
        matchId,
        champion:   participant.championName,
        result:     participant.win ? 'Win' : 'Loss',
        queue,
        duration:   durationMin,
        kda,
        cs:         totalCs,
        csPerMin,
        vision:     participant.visionScore || 0,
        role,
        phases:     phaseScores,
        whyHere,
        tabs: {
          positioning: positioningCards,
          vision:      visionCards,
          macro:       macroCards,
        },
        snapshots,
        defaultSnapshot,
        allGameSnapshot,
      },
    });

  } catch (error) {
    if (error instanceof RiotApiError) {
      if (error.status === 429) {
        return NextResponse.json(
          { success: false, message: 'Riot API rate limit reached.' },
          { status: 429 },
        );
      }
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status || 500 },
      );
    }
    return NextResponse.json(
      { success: false, message: 'Unexpected error loading drill-down.' },
      { status: 500 },
    );
  }
}
