import { AppStatus } from '../../../interfaces';
import classes from './StatusDot.module.css';

interface Props {
  status?: AppStatus;
}

const formatSince = (since: string): string => {
  const date = new Date(since);

  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString([], {
        dateStyle: 'short',
        timeStyle: 'short',
      });
};

export const StatusDot = ({ status }: Props): JSX.Element | null => {
  if (!status) return null;

  const label = `${status.status === 'up' ? 'Up' : 'Down'}: ${
    status.detail
  } (since ${formatSince(status.since)})`;

  return (
    <span
      className={`${classes.StatusDot} ${
        status.status === 'up' ? classes.Up : classes.Down
      }`}
      role="img"
      aria-label={label}
      title={label}
    />
  );
};
