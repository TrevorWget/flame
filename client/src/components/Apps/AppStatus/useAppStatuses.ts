import axios from 'axios';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import { ApiResponse, AppStatuses, AppStatusResponse } from '../../../interfaces';
import { State } from '../../../store/reducers';

const MIN_POLL_SECONDS = 10;
const MAX_POLL_SECONDS = 30;

export const pollSeconds = (checkInterval: number): number =>
  Math.min(Math.max(checkInterval || 0, MIN_POLL_SECONDS), MAX_POLL_SECONDS);

const NO_STATUSES: AppStatuses = {};

/**
 * Latest server-side status check results, polled while the page is visible.
 * The endpoint answers 304 to the browser's ETag revalidation until a status
 * changes, so polling is cheap.
 */
export const useAppStatuses = (): AppStatuses => {
  const { statusChecks, statusCheckInterval } = useSelector(
    (state: State) => state.config.config
  );
  // Logging in or out changes which apps are included
  const isAuthenticated = useSelector((state: State) => state.auth.isAuthenticated);

  const [statuses, setStatuses] = useState<AppStatuses>(NO_STATUSES);

  useEffect(() => {
    if (!statusChecks) {
      setStatuses(NO_STATUSES);
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let timer: number | undefined;

    const poll = async () => {
      if (inFlight) return;

      window.clearTimeout(timer);
      inFlight = true;

      try {
        if (!document.hidden) {
          const res = await axios.get<ApiResponse<AppStatusResponse>>(
            '/api/apps/status'
          );
          const next = res.data.data.statuses;

          if (!cancelled) {
            setStatuses((prev) =>
              JSON.stringify(prev) === JSON.stringify(next) ? prev : next
            );
          }
        }
      } catch {
        // Keep the last known statuses until the server answers again
      } finally {
        inFlight = false;
      }

      if (!cancelled) {
        timer = window.setTimeout(poll, pollSeconds(statusCheckInterval) * 1000);
      }
    };

    const onVisibilityChange = () => {
      if (!document.hidden) poll();
    };

    poll();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [statusChecks, statusCheckInterval, isAuthenticated]);

  return statuses;
};
