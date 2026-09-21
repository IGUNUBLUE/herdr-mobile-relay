import type { Activity } from './types';

// Activity objects are replaced, never mutated, so the searchable text can be
// memoized on the object itself — otherwise every keystroke re-joins and
// re-lowercases all retained entries.
const activityHaystackCache = new WeakMap<Partial<Activity>, string>();

function activityHaystack(activity: Partial<Activity>): string {
  const cached = activityHaystackCache.get(activity);
  if (cached !== undefined) return cached;
  const details = activity.details && typeof activity.details === 'object' ? Object.values(activity.details) : [];
  const haystack = [
    activity.summary, activity.kind, activity.status, activity.relay_label,
    activity.project, activity.session, activity.agent, activity.host,
    activity.pane_id, activity.request_id, activity.extract, ...details,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  activityHaystackCache.set(activity, haystack);
  return haystack;
}

export function activityMatchesSearch(activity: Partial<Activity>, query: string): boolean {
  if (!query) return true;
  return activityHaystack(activity).includes(query.toLowerCase());
}

export function activityForNotification<T extends Pick<Activity, 'details'>>(
  activities: T[],
  notificationId: string,
): T | null {
  if (!notificationId) return null;
  return activities.find((activity) => activity.details
    && (activity.details as { event_id?: string }).event_id === notificationId) || null;
}

export function activityTone(status: unknown): 'danger' | 'warning' | 'success' | 'muted' {
  const value = String(status || '').toLowerCase();
  if (value === 'failed') return 'danger';
  if (['attention', 'unconfirmed', 'completed_with_warning'].includes(value)) return 'warning';
  if (['confirmed', 'completed', 'working', 'idle', 'ready', 'done'].includes(value)) return 'success';
  return 'muted';
}
