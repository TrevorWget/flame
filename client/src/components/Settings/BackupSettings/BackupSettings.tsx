import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import axios, { AxiosError } from 'axios';

// Redux
import { useDispatch, useSelector } from 'react-redux';
import { bindActionCreators } from 'redux';
import { actionCreators } from '../../../store';
import { State } from '../../../store/reducers';

// Typescript
import {
  ApiResponse,
  BackupFile,
  BackupPreview,
  BackupSettingsForm,
} from '../../../interfaces';

// UI
import { Button, InputGroup, SettingsHeadline } from '../../UI';
import classes from './BackupSettings.module.css';

// Utils
import {
  applyAuth,
  backupPreviewNotes,
  backupPreviewRows,
  backupSettingsTemplate,
  formatBytes,
  inputHandler,
} from '../../../utility';

const RELOAD_DELAY_MS = 1500;

type Status = 'idle' | 'checking' | 'restoring' | 'restored';

const errorMessage = (err: unknown, fallback: string): string =>
  (err as AxiosError<{ error?: string }>).response?.data?.error || fallback;

const formatDate = (value: string | null): string =>
  value ? new Date(value).toLocaleString() : 'an unknown date';

const upload = <T,>(path: string, backup: File) => {
  const body = new FormData();
  body.append('backup', backup);

  return axios.post<ApiResponse<T>>(path, body, { headers: applyAuth() });
};

export const BackupSettings = (): JSX.Element => {
  const { loading, config } = useSelector((state: State) => state.config);

  const dispatch = useDispatch();
  const { updateConfig, createNotification } = bindActionCreators(
    actionCreators,
    dispatch
  );

  const [formData, setFormData] = useState<BackupSettingsForm>(
    backupSettingsTemplate
  );
  const [savedBackups, setSavedBackups] = useState<BackupFile[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const fileInput = useRef<HTMLInputElement>(null);
  const reloadTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Only these keys are sent, so the rest of the config is never overwritten
    setFormData({
      backupSchedule:
        config.backupSchedule ?? backupSettingsTemplate.backupSchedule,
      backupRetention:
        config.backupRetention ?? backupSettingsTemplate.backupRetention,
    });
  }, [loading, config]);

  useEffect(() => {
    axios
      .get<ApiResponse<BackupFile[]>>('/api/backup/files')
      .then((res) => setSavedBackups(res.data.data))
      .catch((err) => console.log(err));

    return () => window.clearTimeout(reloadTimer.current);
  }, []);

  const resetRestore = () => {
    setFile(null);
    setPreview(null);
    setError('');
    setStatus('idle');

    if (fileInput.current) fileInput.current.value = '';
  };

  const fileChangeHandler = async (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;

    setFile(selected);
    setPreview(null);
    setError('');

    if (!selected) return;

    setStatus('checking');

    try {
      const res = await upload<BackupPreview>(
        '/api/backup/restore/preview',
        selected
      );
      setPreview(res.data.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not read the backup'));
    } finally {
      setStatus('idle');
    }
  };

  const restoreHandler = async () => {
    if (!file || status !== 'idle') return;

    setStatus('restoring');
    setError('');

    try {
      const res = await upload<{ preRestoreBackup: string }>(
        '/api/backup/restore',
        file
      );

      setStatus('restored');
      createNotification({
        title: 'Success',
        message: `Backup restored. The previous state was saved as ${res.data.data.preRestoreBackup}`,
      });

      // Everything on the page may have changed, including themes and CSS
      reloadTimer.current = window.setTimeout(
        () => window.location.reload(),
        RELOAD_DELAY_MS
      );
    } catch (err) {
      setStatus('idle');
      setError(errorMessage(err, 'Restore failed'));
    }
  };

  const scheduleSubmitHandler = async (e: FormEvent) => {
    e.preventDefault();
    await updateConfig(formData);
  };

  const inputChangeHandler = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    options?: { isNumber?: boolean; isBool?: boolean }
  ) => {
    inputHandler<BackupSettingsForm>({
      e,
      options,
      setStateHandler: setFormData,
      state: formData,
    });
  };

  return (
    <div>
      <section className={classes.section}>
        <SettingsHeadline text="Export" />
        <p className={classes.text}>
          Download apps, bookmarks, categories, settings, themes, search
          providers, custom CSS and uploaded icons as a zip file. The password
          and the weather API key are never included.
        </p>
        <a className={classes.linkButton} href="/api/backup/export" download>
          Download backup
        </a>
      </section>

      <section className={classes.section}>
        <SettingsHeadline text="Restore" />
        <InputGroup>
          <label htmlFor="backupFile">Backup file</label>
          <input
            type="file"
            id="backupFile"
            name="backupFile"
            accept=".zip,application/zip"
            ref={fileInput}
            onChange={fileChangeHandler}
            disabled={status === 'restoring' || status === 'restored'}
          />
          <span>
            A zip file from "Download backup" or from data/backups. It is
            checked before anything is changed.
          </span>
        </InputGroup>

        {status === 'checking' && (
          <p className={classes.text}>Checking the backup...</p>
        )}

        {error && (
          <p className={classes.error} role="alert">
            {error}
          </p>
        )}

        {preview && status !== 'restored' && (
          <div aria-label="Restore preview">
            <p className={classes.text}>
              Backup from <span>{formatDate(preview.manifest.createdAt)}</span>
              {preview.manifest.flameVersion &&
                ` (Flame ${preview.manifest.flameVersion})`}
            </p>

            <table className={classes.table}>
              <thead>
                <tr>
                  <th></th>
                  <th>Now</th>
                  <th>In backup</th>
                </tr>
              </thead>
              <tbody>
                {backupPreviewRows(preview).map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    <td>{row.current}</td>
                    <td>{row.backup ?? 'Not included, kept'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className={classes.notes}>
              {backupPreviewNotes(preview).map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>

            <p className={classes.text}>
              Restoring replaces all apps, bookmarks and categories. The current
              state is saved to data/backups first, so you can go back to it.
            </p>

            <div className={classes.buttons}>
              <Button click={restoreHandler}>
                {status === 'restoring' ? 'Restoring...' : 'Restore backup'}
              </Button>
              <Button click={resetRestore}>Cancel</Button>
            </div>
          </div>
        )}

        {status === 'restored' && (
          <p className={classes.text}>Backup restored. Reloading...</p>
        )}
      </section>

      <form className={classes.section} onSubmit={scheduleSubmitHandler}>
        <SettingsHeadline text="Scheduled backups" />
        <InputGroup>
          <label htmlFor="backupSchedule">Save a backup to data/backups</label>
          <select
            id="backupSchedule"
            name="backupSchedule"
            value={formData.backupSchedule}
            onChange={(e) => inputChangeHandler(e)}
          >
            <option value="off">Never</option>
            <option value="daily">Daily at 03:30</option>
            <option value="weekly">Weekly, on Sunday at 03:30</option>
          </select>
          <span>Times are in the server's time zone</span>
        </InputGroup>

        <InputGroup>
          <label htmlFor="backupRetention">Scheduled backups to keep</label>
          <input
            type="number"
            id="backupRetention"
            name="backupRetention"
            min={1}
            max={365}
            value={formData.backupRetention}
            onChange={(e) => inputChangeHandler(e, { isNumber: true })}
          />
          <span>
            Older ones are deleted. The last 5 backups taken before a restore
            are kept separately
          </span>
        </InputGroup>

        <Button>Save changes</Button>
      </form>

      <section>
        <SettingsHeadline text="Saved backups" />
        {savedBackups.length === 0 ? (
          <p className={classes.text}>No saved backups yet</p>
        ) : (
          <ul className={classes.files}>
            {savedBackups.map((backup) => (
              <li key={backup.name}>
                <a
                  href={`/api/backup/files/${encodeURIComponent(backup.name)}`}
                  download
                >
                  {backup.name}
                </a>
                <span>
                  {backup.kind === 'pre-restore' ? 'Before a restore, ' : ''}
                  {formatBytes(backup.size)},{' '}
                  {new Date(backup.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
