import type { StravaTokenResponse, StravaAuthState } from '../types';

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const STORAGE_KEY = 'cambridge_runs_strava_auth';
const REQUIRED_SCOPE = 'activity:read_all';

export const stravaAuth = {
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

  getAuthUrl(): string {
    const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_STRAVA_REDIRECT_URI || `${window.location.origin}/`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: REQUIRED_SCOPE,
    });

    return `${STRAVA_AUTH_URL}?${params}`;
  },

  getAuthCodeFromUrl(): string | null {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const scope = params.get('scope');

    if (code && scope && scope.includes('read')) {
      return code;
    }
    return null;
  },

  clearAuthCodeFromUrl(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('code');
    url.searchParams.delete('scope');
    url.searchParams.delete('state');
    window.history.replaceState({}, '', url.toString());
  },

  async exchangeCodeForToken(code: string): Promise<StravaTokenResponse> {
    const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
    const clientSecret = import.meta.env.VITE_STRAVA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Strava client credentials not configured');
    }

    const response = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code: ${error}`);
    }

    return response.json();
  },

  async refreshAccessToken(refreshToken: string): Promise<StravaTokenResponse> {
    const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
    const clientSecret = import.meta.env.VITE_STRAVA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Strava client credentials not configured');
    }

    const response = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh token: ${error}`);
    }

    return response.json();
  },

  initiateOAuth(): void {
    window.location.href = this.getAuthUrl();
  },

  async handleOAuthCallback(): Promise<StravaAuthState | null> {
    const code = this.getAuthCodeFromUrl();
    if (!code) return null;

    try {
      const tokenResponse = await this.exchangeCodeForToken(code);
      const auth: StravaAuthState = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt: tokenResponse.expires_at,
        athleteId: tokenResponse.athlete?.id ?? null,
        athleteName: tokenResponse.athlete
          ? `${tokenResponse.athlete.firstname} ${tokenResponse.athlete.lastname}`
          : null,
      };

      this.storeAuth(auth);
      this.clearAuthCodeFromUrl();
      return auth;
    } catch (error) {
      console.error('OAuth callback failed:', error);
      this.clearAuthCodeFromUrl();
      throw error;
    }
  },

  async getValidAccessToken(): Promise<string | null> {
    let auth = this.getStoredAuth();
    if (!auth) return null;

    if (this.isTokenExpired(auth.expiresAt) && auth.refreshToken) {
      try {
        const tokenResponse = await this.refreshAccessToken(auth.refreshToken);
        auth = {
          ...auth,
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          expiresAt: tokenResponse.expires_at,
        };
        this.storeAuth(auth);
      } catch (error) {
        console.error('Failed to refresh token:', error);
        this.clearAuth();
        return null;
      }
    }

    return auth.accessToken;
  },
};
