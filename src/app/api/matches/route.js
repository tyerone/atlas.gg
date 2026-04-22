import { NextResponse } from 'next/server';
import {
  RiotApiError,
  formatKda,
  formatMatchDuration,
  getParticipantCs,
  getRegionalRoute,
  mapParticipantRole,
  normalizePlatformRegion,
  queueLabelFromId,
  riotFetchJson,
} from '@/lib/riot';

function toMatchSummary(match, participant) {
  return {
    id: match.metadata.matchId,
    champion: participant.championName,
    role: mapParticipantRole(participant),
    result: participant.win ? 'Win' : 'Loss',
    duration: formatMatchDuration(match.info.gameDuration),
    durationSeconds: match.info.gameDuration,
    kda: formatKda(participant),
    cs: getParticipantCs(participant),
    queue: queueLabelFromId(match.info.queueId),
    timestamp: match.info.gameEndTimestamp || match.info.gameCreation,
    kills: participant.kills || 0,
    deaths: participant.deaths || 0,
    assists: participant.assists || 0,
    visionScore: participant.visionScore || 0,
    totalDamageDealtToChampions: participant.totalDamageDealtToChampions || 0,
    goldEarned: participant.goldEarned || 0,
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const puuid = searchParams.get('puuid');
    const region = searchParams.get('region') || 'NA1';
    const countRaw = Number.parseInt(searchParams.get('count') || '10', 10);
    const count = Number.isFinite(countRaw) ? Math.min(Math.max(countRaw, 1), 20) : 10;

    if (!puuid) {
      return NextResponse.json(
        {
          success: false,
          message: 'puuid is required.',
        },
        { status: 400 },
      );
    }

    const platformRegion = normalizePlatformRegion(region);
    const regionalRoute = getRegionalRoute(platformRegion);

    const idsUrl = new URL(
      `https://${regionalRoute}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids`,
    );
    idsUrl.searchParams.set('start', '0');
    idsUrl.searchParams.set('count', String(count));

    const matchIds = await riotFetchJson(idsUrl.toString());
    const matches = [];

    for (const matchId of matchIds) {
      const match = await riotFetchJson(
        `https://${regionalRoute}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
      );

      const participant = match.info.participants.find((p) => p.puuid === puuid);

      if (!participant) {
        continue;
      }

      matches.push(toMatchSummary(match, participant));
    }

    return NextResponse.json({
      success: true,
      matches,
      platformRegion,
      regionalRoute,
    });
  } catch (error) {
    if (error instanceof RiotApiError) {
      if (error.status === 404) {
        return NextResponse.json(
          {
            success: false,
            message: 'No matches found for this Riot account.',
          },
          { status: 404 },
        );
      }

      if (error.status === 429) {
        return NextResponse.json(
          {
            success: false,
            message: 'Riot API rate limit reached while loading matches.',
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
        message: 'Unexpected error while loading matches.',
      },
      { status: 500 },
    );
  }
}
