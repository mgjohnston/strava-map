import { stravaApi, isRun } from './stravaApi';
import type { StravaActivity } from '../types';

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('./stravaAuth', () => ({
  stravaAuth: {
    getValidAccessToken: jest.fn(),
  },
}));

import { stravaAuth } from './stravaAuth';

const createMockActivity = (id: number, sportType: string = 'Run'): StravaActivity => ({
  id,
  name: `Test Activity ${id}`,
  distance: 5000,
  moving_time: 1800,
  elapsed_time: 1900,
  total_elevation_gain: 50,
  type: sportType === 'Run' || sportType === 'TrailRun' || sportType === 'VirtualRun' ? 'Run' : sportType,
  sport_type: sportType,
  start_date: '2026-01-01T10:00:00Z',
  start_date_local: '2026-01-01T10:00:00',
  timezone: 'Europe/London',
  average_speed: 2.78,
  max_speed: 3.5,
  kudos_count: 5,
});

describe('isRun', () => {
  it('returns true for Run, TrailRun, VirtualRun sport_type', () => {
    expect(isRun(createMockActivity(1, 'Run'))).toBe(true);
    expect(isRun(createMockActivity(2, 'TrailRun'))).toBe(true);
    expect(isRun(createMockActivity(3, 'VirtualRun'))).toBe(true);
  });

  it('returns false for non-run sport_types', () => {
    expect(isRun(createMockActivity(4, 'Ride'))).toBe(false);
    expect(isRun(createMockActivity(5, 'AlpineSki'))).toBe(false);
    expect(isRun(createMockActivity(6, 'Walk'))).toBe(false);
  });
});

describe('stravaApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAthleteActivities', () => {
    it('fetches activities with correct authorization header', async () => {
      const mockActivities = [createMockActivity(1)];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockActivities),
      });

      const result = await stravaApi.getAthleteActivities('test-token');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/athlete/activities'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        })
      );
      expect(result).toEqual(mockActivities);
    });

    it('throws error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
      await expect(stravaApi.getAthleteActivities('test-token')).rejects.toThrow(
        'Strava API error: 401'
      );
    });
  });

  describe('fetchRunsInDateRange', () => {
    it('throws when not authenticated', async () => {
      (stravaAuth.getValidAccessToken as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        stravaApi.fetchRunsInDateRange('2026-01-01', '2026-03-15')
      ).rejects.toThrow('Not authenticated with Strava');
    });

    it('filters out non-run activities', async () => {
      (stravaAuth.getValidAccessToken as jest.Mock).mockResolvedValueOnce('valid-token');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            createMockActivity(1, 'Run'),
            createMockActivity(2, 'Ride'),
            createMockActivity(3, 'TrailRun'),
            createMockActivity(4, 'AlpineSki'),
          ]),
      });

      const result = await stravaApi.fetchRunsInDateRange('2026-01-01', '2026-03-15');

      expect(result).toHaveLength(2);
      expect(result.map((a) => a.sport_type)).toEqual(['Run', 'TrailRun']);
    });
  });
});
