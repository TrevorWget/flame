import { CSSProperties } from 'react';

import { AppStatus, AppStatusName } from '../../../interfaces';
import { StatusColors } from '../../../utility';
import classes from './StatusDot.module.css';
import { useStatusColors } from './useStatusColors';

interface Props {
  status?: AppStatus;
  // Instead of the saved colors, e.g. to preview unsaved settings
  colors?: StatusColors;
}

const LABELS: Record<AppStatusName, string> = {
  up: 'Up',
  unhealthy: 'Unhealthy',
  down: 'Down',
};

// Each status also has its own shape, so colors never have to be told apart
const SHAPES: Record<AppStatusName, string> = {
  up: classes.Up,
  unhealthy: classes.Unhealthy,
  down: classes.Down,
};

const formatSince = (since: string): string => {
  const date = new Date(since);

  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString([], {
        dateStyle: 'short',
        timeStyle: 'short',
      });
};

export const StatusDot = ({ status, colors }: Props): JSX.Element | null => {
  const savedColors = useStatusColors();
  const dotColors = colors || savedColors;

  if (!status || !(status.status in LABELS)) return null;

  const label = `${LABELS[status.status]}: ${status.detail} (since ${formatSince(
    status.since
  )})`;

  return (
    <span
      className={`${classes.StatusDot} ${SHAPES[status.status]}`}
      style={{ '--status-color': dotColors[status.status] } as CSSProperties}
      role="img"
      aria-label={label}
      title={label}
      data-status={status.status}
    />
  );
};
