import { NextResponse } from 'next/server';
import {
  RiotApiError,
  getRegionalRoute,
  normalizePlatformRegion,
  parseRiotId,
  riotFetchJson,
} from '@/lib/riot';

export async function POST(request) {
  try {
    const body = await request.json();
    const riotId = body?.riotId;
    const region = body?.region;

    if (!riotId || !region) {
      return NextResponse.json(
        {
          success: false,
          message: 'riotId and region are required.',
        },
        { status: 400 },
      );
    }

    const parsed = parseRiotId(riotId);

    if (!parsed) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid Riot ID format. Use Playername#TAG.',
        },
        { status: 400 },
      );
    }

    const platformRegion = normalizePlatformRegion(region);
    const regionalRoute = getRegionalRoute(platformRegion);

    const account = await riotFetchJson(
      `https://${regionalRoute}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(parsed.gameName)}/${encodeURIComponent(parsed.tagLine)}`,
    );

    return NextResponse.json({
      success: true,
      puuid: account.puuid,
      gameName: account.gameName,
      tagLine: account.tagLine,
      riotId: `${account.gameName}#${account.tagLine}`,
      platformRegion,
      regionalRoute,
    });
  } catch (error) {
    if (error instanceof RiotApiError) {
      if (error.status === 404) {
        return NextResponse.json(
          {
            success: false,
            message: 'Riot ID not found. Verify game name, tag, and region.',
          },
          { status: 404 },
        );
      }

      if (error.status === 401 || error.status === 403) {
        return NextResponse.json(
          {
            success: false,
            message: 'Riot API key rejected by Riot. Check RIOT_API_KEY.',
          },
          { status: 401 },
        );
      }

      if (error.status === 429) {
        return NextResponse.json(
          {
            success: false,
            message: 'Riot API rate limit reached. Please retry shortly.',
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
        message: 'Unexpected error while connecting Riot ID.',
      },
      { status: 500 },
    );
  }
}
