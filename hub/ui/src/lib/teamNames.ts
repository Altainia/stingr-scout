import type { Api } from './api';

/** Team names, for labels. They only add to what a page shows, so if they can't be loaded the page goes on without them. */
export const loadTeamNames = (api: Api): Promise<Record<number, string>> => api.teamNames().catch(() => ({}));
