import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BackupFile, BackupPreview } from '../../../interfaces';
import { store } from '../../../store/store';
import { BackupSettings } from './BackupSettings';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

const preview: BackupPreview = {
  manifest: {
    schemaVersion: 1,
    flameVersion: '2.5.0',
    createdAt: '2026-10-29T12:00:00.000Z',
  },
  backup: {
    categories: 3,
    apps: 12,
    bookmarks: 40,
    themes: 17,
    queries: null,
    settings: 30,
    css: true,
    uploads: 4,
  },
  current: {
    categories: 1,
    apps: 2,
    bookmarks: 0,
    themes: 16,
    queries: 2,
    uploads: 0,
  },
};

const savedBackups: BackupFile[] = [
  {
    name: 'pre-restore-20261029T120000000Z.zip',
    kind: 'pre-restore',
    size: 2048,
    createdAt: '2026-10-29T12:00:00.000Z',
  },
];

const ok = <T,>(data: T) => ({ data: { success: true, data } });

const renderSettings = () =>
  render(
    <Provider store={store}>
      <BackupSettings />
    </Provider>
  );

const chooseFile = async () => {
  const file = new File(['zip'], 'flame-backup.zip', {
    type: 'application/zip',
  });
  await userEvent.upload(screen.getByLabelText('Backup file'), file);
  return file;
};

describe('BackupSettings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedAxios.get.mockResolvedValue(ok([]));
  });

  it('links the export download', () => {
    renderSettings();

    expect(
      screen.getByRole('link', { name: 'Download backup' })
    ).toHaveAttribute('href', '/api/backup/export');
  });

  it('previews the counts, then restores the same file', async () => {
    mockedAxios.post.mockImplementation(async (url) =>
      url.endsWith('/preview')
        ? ok(preview)
        : ok({ preRestoreBackup: 'pre-restore-20261029T130000000Z.zip' })
    );
    renderSettings();

    const file = await chooseFile();
    const table = await screen.findByRole('table');

    const [previewUrl, previewBody, previewOptions] =
      mockedAxios.post.mock.calls[0];
    expect(previewUrl).toBe('/api/backup/restore/preview');
    expect((previewBody as FormData).get('backup')).toBe(file);
    expect(previewOptions).toEqual({ headers: { 'X-Flame-CSRF': '1' } });

    const cells = (label: RegExp) =>
      within(within(table).getByRole('row', { name: label }))
        .getAllByRole('cell')
        .map((cell) => cell.textContent);

    expect(cells(/^Apps/)).toEqual(['2', '12']);
    expect(cells(/^Bookmarks/)).toEqual(['0', '40']);
    expect(cells(/^Search providers/)).toEqual(['2', 'Not included, kept']);
    expect(
      screen.getByText('Replaces 30 settings (the weather API key is kept)')
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Restore backup' })
    );

    expect(
      await screen.findByText('Backup restored. Reloading...')
    ).toBeInTheDocument();
    const [restoreUrl, restoreBody] = mockedAxios.post.mock.calls[1];
    expect(restoreUrl).toBe('/api/backup/restore');
    expect((restoreBody as FormData).get('backup')).toBe(file);
  });

  it("shows the server's reason when a backup is rejected", async () => {
    mockedAxios.post.mockRejectedValue({
      response: {
        data: { error: 'Invalid backup: unexpected file evil.html' },
      },
    });
    renderSettings();

    await chooseFile();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid backup: unexpected file evil.html'
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Restore backup' })
    ).not.toBeInTheDocument();
  });

  it('lists saved backups with download links', async () => {
    mockedAxios.get.mockResolvedValue(ok(savedBackups));
    renderSettings();

    const link = await screen.findByRole('link', {
      name: 'pre-restore-20261029T120000000Z.zip',
    });
    expect(link).toHaveAttribute(
      'href',
      '/api/backup/files/pre-restore-20261029T120000000Z.zip'
    );
    expect(screen.getByText(/Before a restore, 2\.0 KB/)).toBeInTheDocument();
  });

  it('saves only the backup settings', async () => {
    mockedAxios.put.mockResolvedValue(
      ok({ ...store.getState().config.config, backupSchedule: 'daily' })
    );
    renderSettings();

    await userEvent.selectOptions(
      screen.getByLabelText('Save a backup to data/backups'),
      'daily'
    );
    const retention = screen.getByLabelText('Scheduled backups to keep');
    await userEvent.clear(retention);
    await userEvent.type(retention, '14');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(mockedAxios.put).toHaveBeenCalledWith(
      '/api/config',
      { backupSchedule: 'daily', backupRetention: 14 },
      { headers: { 'X-Flame-CSRF': '1' } }
    );
  });
});
