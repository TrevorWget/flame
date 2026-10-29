import { Model } from '.';

export type AppUrlType = 'internal' | 'external';

export interface NewApp {
  name: string;
  url: string;
  externalUrl?: string;
  preferredUrl?: AppUrlType;
  categoryId: number;
  icon: string;
  isPublic: boolean;
  description: string;
  statusCheck: boolean;
  // Checked instead of the app URL when set
  statusUrl: string | null;
}

export interface AppStatus {
  status: 'up' | 'down';
  detail: string;
  // ISO date of the last change between up and down
  since: string;
}

export type AppStatuses = Record<number, AppStatus>;

export interface AppStatusResponse {
  enabled: boolean;
  statuses: AppStatuses;
}

export interface App extends Model, NewApp {
  orderId: number;
  isPinned: boolean;
}
