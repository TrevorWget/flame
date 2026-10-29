import { BackupPreview } from '../interfaces';

export interface BackupPreviewRow {
  label: string;
  current: number;
  backup: number | null;
}

export const backupPreviewRows = ({
  backup,
  current,
}: BackupPreview): BackupPreviewRow[] => [
  {
    label: 'Categories',
    current: current.categories,
    backup: backup.categories,
  },
  { label: 'Apps', current: current.apps, backup: backup.apps },
  { label: 'Bookmarks', current: current.bookmarks, backup: backup.bookmarks },
  { label: 'Themes', current: current.themes, backup: backup.themes },
  {
    label: 'Search providers',
    current: current.queries,
    backup: backup.queries,
  },
  { label: 'Uploaded icons', current: current.uploads, backup: backup.uploads },
];

export const backupPreviewNotes = ({ backup }: BackupPreview): string[] => [
  backup.settings === null
    ? 'Keeps the current settings'
    : `Replaces ${backup.settings} settings (the weather API key is kept)`,
  backup.css ? 'Replaces the custom CSS' : 'Keeps the current custom CSS',
  'Adds the uploaded icons to the ones already there',
];

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
