import axios, { AxiosError } from 'axios';
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { bindActionCreators } from 'redux';

import { ApiResponse } from '../../../../interfaces';
import { actionCreators } from '../../../../store';
import { applyAuth, isImage, isSvg, isUrl } from '../../../../utility';
import classes from './FetchIcon.module.css';

interface Props {
  // App or bookmark URL
  url: string;
  // Current value of the icon field
  icon: string;
  onFetched: (icon: string) => void;
}

/**
 * Lets the server download the site's favicon (or the icon URL typed into the
 * icon field) into Flame's local icon cache, and previews the current icon
 */
export const FetchIcon = ({ url, icon, onFetched }: Props): JSX.Element => {
  const dispatch = useDispatch();
  const { createNotification } = bindActionCreators(actionCreators, dispatch);
  const [fetching, setFetching] = useState(false);

  const fromIconUrl = isUrl(icon.trim());
  const source = fromIconUrl ? icon.trim() : url.trim();
  const showPreview = isImage(icon) || isSvg(icon);

  const fetchIcon = async () => {
    if (!source) {
      createNotification({
        title: 'Error',
        message: 'Enter a URL to fetch the icon from',
      });
      return;
    }

    setFetching(true);

    try {
      const res = await axios.post<ApiResponse<{ icon: string }>>(
        '/api/icons/fetch',
        { url: source },
        { headers: applyAuth() }
      );

      onFetched(res.data.data.icon);
    } catch (err) {
      const error = err as AxiosError<{ error: string }>;

      createNotification({
        title: 'Error',
        message: error.response?.data?.error || 'Could not fetch the icon',
      });
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className={classes.FetchIcon}>
      {showPreview && (
        <img
          src={isUrl(icon) ? icon : `/uploads/${icon}`}
          alt="Current icon"
          className={classes.Preview}
        />
      )}
      <button
        type="button"
        className={classes.FetchButton}
        onClick={fetchIcon}
        disabled={fetching}
      >
        {fetching
          ? 'Fetching icon...'
          : fromIconUrl
          ? 'Store this icon in Flame'
          : 'Fetch icon from site'}
      </button>
    </div>
  );
};
