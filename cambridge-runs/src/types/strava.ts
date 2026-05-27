export interface StravaAthlete {
  id: number;
  firstname: string;
  lastname: string;
  profile: string;
}

export interface StravaTokenResponse {
  token_type: 'Bearer';
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
  athlete?: StravaAthlete;
}

export interface StravaActivity {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  type: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  timezone: string;
  average_speed: number;
  max_speed: number;
  kudos_count: number;
  start_latlng?: [number, number] | null;
  end_latlng?: [number, number] | null;
  map?: {
    id?: string;
    polyline?: string;
    summary_polyline?: string;
  };
}

export interface StravaAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  athleteId: number | null;
  athleteName: string | null;
}
