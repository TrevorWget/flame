import { Model } from '.';

export interface NewBookmark {
  name: string;
  url: string;
  categoryId: number;
  icon: string;
  // Shown instead of `icon` on dark / light themes when set
  iconOnDark?: string | null;
  iconOnLight?: string | null;
  isPublic: boolean;
}

export interface Bookmark extends Model, NewBookmark {
  orderId: number;
}
