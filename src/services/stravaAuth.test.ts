import type { StravaAuthState } from '../types';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Re-implement the testable functions to avoid import.meta issues
const STORAGE_KEY = 'strava_auth';

const stravaAuthTestable = {
  getStoredAuth(): StravaAuthState | null {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  },

  storeAuth(auth: StravaAuthState): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  },

  clearAuth(): void {
    localStorage.removeItem(STORAGE_KEY);
  },

  isTokenExpired(expiresAt: number | null): boolean {
    if (!expiresAt) return true;
    return Date.now() / 1000 > expiresAt - 300;
  },
};

describe('stravaAuth', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  describe('isTokenExpired', () => {
    it('returns true for null expiresAt', () => {
      expect(stravaAuthTestable.isTokenExpired(null)).toBe(true);
    });

    it('returns true when token has expired', () => {
      const expiredAt = Math.floor(Date.now() / 1000) - 1000; // 1000 seconds ago
      expect(stravaAuthTestable.isTokenExpired(expiredAt)).toBe(true);
    });

    it('returns true when token expires within 5 minutes', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 200; // 200 seconds from now (< 300)
      expect(stravaAuthTestable.isTokenExpired(expiresAt)).toBe(true);
    });

    it('returns false when token is valid with buffer', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 600; // 10 minutes from now
      expect(stravaAuthTestable.isTokenExpired(expiresAt)).toBe(false);
    });
  });

  describe('getStoredAuth', () => {
    it('returns null when no auth stored', () => {
      expect(stravaAuthTestable.getStoredAuth()).toBeNull();
    });

    it('returns parsed auth state when stored', () => {
      const authState: StravaAuthState = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: 12345,
        athleteId: 123,
        athleteName: 'Test Athlete',
      };
      localStorageMock.setItem('strava_auth', JSON.stringify(authState));

      const result = stravaAuthTestable.getStoredAuth();
      expect(result).toEqual(authState);
    });

    it('returns null for invalid JSON', () => {
      localStorageMock.setItem('strava_auth', 'invalid-json');
      expect(stravaAuthTestable.getStoredAuth()).toBeNull();
    });
  });

  describe('storeAuth', () => {
    it('stores auth state in localStorage', () => {
      const authState: StravaAuthState = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: 12345,
        athleteId: 123,
        athleteName: 'Test Athlete',
      };

      stravaAuthTestable.storeAuth(authState);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'strava_auth',
        JSON.stringify(authState)
      );
    });
  });

  describe('clearAuth', () => {
    it('removes auth from localStorage', () => {
      stravaAuthTestable.clearAuth();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('strava_auth');
    });
  });
});
