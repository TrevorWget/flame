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
}

export interface App extends Model, NewApp {
  orderId: number;
  isPinned: boolean;
}
