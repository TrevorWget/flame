import { Model } from '.';

export type AppUrlType = 'internal' | 'external';

export interface NewApp {
  name: string;
  url: string;
  externalUrl?: string;
  preferredUrl?: AppUrlType;
  categoryId: number;
  icon: string;
  // Shown instead of `icon` on dark / light themes when set
  iconOnDark?: string | null;
  iconOnLight?: string | null;
  isPublic: boolean;
  description: string;
  statusCheck: boolean;
  // Checked instead of the app URL when set
  statusUrl: string | null;
}

// unhealthy: the app answers with a server error or slowly, or its container
// is restarting or failing its health check
export type AppStatusName = 'up' | 'unhealthy' | 'down';

export interface AppStatus {
  status: AppStatusName;
  detail: string;
  // ISO date of the last change of status
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
