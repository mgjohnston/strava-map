import { stravaApi } from './stravaApi';
import type { StravaActivity } from '../types';

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('./stravaAuth', () => ({
  stravaAuth: {
    getValidAccessToken: jest.fn(),
  },
}));

import { stravaAuth } from './stravaAuth';

const createMockActivity = (id: number, type: string = 'Run'): StravaActivity => ({
  id,
  name: `Test Activity ${id}`,
  distance: 5000,
  moving_time: 1800,
  elapsed_time: 1900,
  total_elevation_gain: 50,
  type,
  sport_type: type,
  start_date: '2026-01-01T10:00:00Z',
  start_date_local: '2026-01-01T10:00:00',
  timezone: 'Europe/London',
  average_speed: 2.78,
  max_speed: 3.5,
  kudos_count: 5,
});

describe('stravaApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAthleteActivities', () => {
    it('fetches activities with correct authorization header', async () => {
      const mockActivities = [createMockActivity(1), createMockActivity(2)];
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

    it('includes pagination parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await stravaApi.getAthleteActivities('test-token', { page: 2, perPage: 50 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/page=2.*per_page=50|per_page=50.*page=2/),
        expect.anything()
      );
    });

    it('includes date filters when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await stravaApi.getAthleteActivities('test-token', {
        after: 1704067200,
        before: 1706745600,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/after=1704067200/),
        expect.anything()
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/before=1706745600/),
        expect.anything()
      );
    });

    it('throws error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(stravaApi.getAthleteActivities('test-token')).rejects.toThrow(
        'Strava API error: 401'
      );
    });
  });

  describe('getAllActivitiesInDateRange', () => {
    it('returns all activities regardless of sport_type', async () => {
      const mockActivities = [
        createMockActivity(1, 'Run'),
        createMockActivity(2, 'Ride'),
        createMockActivity(3, 'AlpineSki'),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockActivities),
      });

      const result = await stravaApi.getAllActivitiesInDateRange(
        'test-token',
        '2025-01-01',
        '2025-12-31'
      );

      expect(result).toHaveLength(3);
      expect(result.map((a) => a.sport_type)).toEqual(['Run', 'Ride', 'AlpineSki']);
    });

    it('paginates through multiple pages', async () => {
      const page1 = Array(100)
        .fill(null)
        .map((_, i) => createMockActivity(i + 1));
      const page2 = Array(10)
        .fill(null)
        .map((_, i) => createMockActivity(i + 101));

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(page1) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(page2) });

      const result = await stravaApi.getAllActivitiesInDateRange(
        'test-token',
        '2026-01-01',
        '2026-03-15'
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(110);
    });
  });

  describe('fetchActivitiesInDateRange', () => {
    it('throws when not authenticated', async () => {
      (stravaAuth.getValidAccessToken as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        stravaApi.fetchActivitiesInDateRange('2026-01-01', '2026-03-15')
      ).rejects.toThrow('Not authenticated with Strava');
    });

    it('fetches all activity types when authenticated', async () => {
      (stravaAuth.getValidAccessToken as jest.Mock).mockResolvedValueOnce('valid-token');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([createMockActivity(1, 'AlpineSki')]),
      });

      const result = await stravaApi.fetchActivitiesInDateRange('2025-01-01', '2025-12-31');

      expect(result).toHaveLength(1);
      expect(result[0].sport_type).toBe('AlpineSki');
    });
  });
});
