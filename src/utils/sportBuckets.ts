import type { StravaActivity } from '../types';

export type BucketId = 'run' | 'ride' | 'ski' | 'hike' | 'swim' | 'water' | 'other';

interface BucketDef {
  label: string;
  emoji: string;
  sportTypes: string[];
}

export const SPORT_BUCKETS: Record<BucketId, BucketDef> = {
  run: {
    label: 'Run',
    emoji: '🏃',
    sportTypes: ['Run', 'TrailRun', 'VirtualRun'],
  },
  ride: {
    label: 'Ride',
    emoji: '🚴',
    sportTypes: [
      'Ride',
      'MountainBikeRide',
      'GravelRide',
      'EBikeRide',
      'EMountainBikeRide',
      'VirtualRide',
      'Velomobile',
      'Handcycle',
    ],
  },
  ski: {
    label: 'Ski/Snow',
    emoji: '⛷️',
    sportTypes: [
      'AlpineSki',
      'BackcountrySki',
      'NordicSki',
      'RollerSki',
      'Snowboard',
      'Snowshoe',
      'IceSkate',
    ],
  },
  hike: {
    label: 'Hike/Walk',
    emoji: '🥾',
    sportTypes: ['Hike', 'Walk'],
  },
  swim: {
    label: 'Swim',
    emoji: '🏊',
    sportTypes: ['Swim'],
  },
  water: {
    label: 'Water',
    emoji: '🚣',
    sportTypes: ['Kayaking', 'Canoeing', 'Rowing', 'StandUpPaddling', 'Surfing', 'Kitesurf', 'Windsurf', 'Sail'],
  },
  other: {
    label: 'Other',
    emoji: '🏷️',
    sportTypes: [],
  },
};

export const ALL_BUCKET_IDS: BucketId[] = ['run', 'ride', 'ski', 'hike', 'swim', 'water', 'other'];

const SPORT_TO_BUCKET: Map<string, BucketId> = new Map();
for (const id of ALL_BUCKET_IDS) {
  for (const sport of SPORT_BUCKETS[id].sportTypes) {
    SPORT_TO_BUCKET.set(sport, id);
  }
}

function activitySport(activity: StravaActivity): string {
  return activity.sport_type || activity.type || '';
}

export function bucketOf(activity: StravaActivity): BucketId {
  const sport = activitySport(activity);
  return SPORT_TO_BUCKET.get(sport) ?? 'other';
}

export function matchesBuckets(
  activity: StravaActivity,
  selectedBuckets: Set<BucketId>,
  selectedSportTypes: Set<string>,
): boolean {
  if (!selectedBuckets.has(bucketOf(activity))) return false;
  if (selectedSportTypes.size === 0) return true;
  return selectedSportTypes.has(activitySport(activity));
}

export function uniqueSportTypes(activities: StravaActivity[]): string[] {
  const set = new Set<string>();
  for (const a of activities) {
    const sport = activitySport(a);
    if (sport) set.add(sport);
  }
  return Array.from(set).sort();
}
