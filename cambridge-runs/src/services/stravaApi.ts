import type { StravaActivity } from '../types';
import { stravaAuth } from './stravaAuth';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

// sport_type values Strava uses for running
const RUN_SPORT_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);

export function isRun(a: StravaActivity): boolean {
  return RUN_SPORT_TYPES.has(a.sport_type) || a.type === 'Run';
}

export const stravaApi = {
  async getAthleteActivities(
    accessToken: string,
    options: {
      after?: number;
      before?: number;
      page?: number;
      perPage?: number;
    } = {}
  ): Promise<StravaActivity[]> {
    const { after, before, page = 1, perPage = 30 } = options;

    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });

    if (after) params.append('after', String(after));
    if (before) params.append('before', String(before));

    const response = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Strava API error: ${response.status}`);
    }

    return response.json();
  },

  async getAllActivitiesInDateRange(
    accessToken: string,
    startDate: string,
    endDate: string
  ): Promise<StravaActivity[]> {
    const after = Math.floor(new Date(startDate).getTime() / 1000);
    const before = Math.floor(new Date(endDate).getTime() / 1000) + 86400;

    const allActivities: StravaActivity[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const activities = await this.getAthleteActivities(accessToken, {
        after,
        before,
        page,
        perPage: 100,
      });

      allActivities.push(...activities);
      hasMore = activities.length === 100;
      page++;

      if (page > 50) break;
    }

    return allActivities;
  },

  async fetchRunsInDateRange(
    startDate: string,
    endDate: string
  ): Promise<StravaActivity[]> {
    const accessToken = await stravaAuth.getValidAccessToken();
    if (!accessToken) {
      throw new Error('Not authenticated with Strava');
    }
    const all = await this.getAllActivitiesInDateRange(accessToken, startDate, endDate);
    return all.filter(isRun);
  },
};
