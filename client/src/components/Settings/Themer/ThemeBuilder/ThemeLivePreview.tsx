import { CSSProperties } from 'react';
import { shallowEqual, useSelector } from 'react-redux';

import { AppStatusName, ThemeColors } from '../../../../interfaces';
import { State } from '../../../../store/reducers';
import { getFont, statusColors } from '../../../../utility';
import { StatusDot } from '../../../Apps/AppStatus/StatusDot';
import { Icon } from '../../../UI';
import classes from './ThemeLivePreview.module.css';

const SINCE = new Date().toISOString();

const CATEGORIES: {
  name: string;
  apps: { name: string; url: string; icon: string; status: AppStatusName }[];
}[] = [
  {
    name: 'Media',
    apps: [
      {
        name: 'Jellyfin',
        url: 'jellyfin.local',
        icon: 'mdiPlayCircle',
        status: 'up',
      },
      {
        name: 'Sonarr',
        url: 'sonarr.local',
        icon: 'mdiTelevision',
        status: 'unhealthy',
      },
    ],
  },
  {
    name: 'Tools',
    apps: [
      { name: 'Nextcloud', url: 'cloud.local', icon: 'mdiCloud', status: 'up' },
      {
        name: 'Backups',
        url: 'backup.local',
        icon: 'mdiHarddisk',
        status: 'down',
      },
    ],
  },
];

const BOOKMARKS = ['Docs', 'GitHub', 'Forecast'];

interface Props {
  colors: ThemeColors;
}

/** A small copy of the homepage drawn with unsaved theme colors */
export const ThemeLivePreview = ({ colors }: Props): JSX.Element => {
  const fontFamily = useSelector(
    (state: State) => state.config.config.fontFamily
  );
  const overrides = useSelector(
    ({ config: { config } }: State) => ({
      statusColorUp: config.statusColorUp,
      statusColorUnhealthy: config.statusColorUnhealthy,
      statusColorDown: config.statusColorDown,
    }),
    shallowEqual
  );

  const dots = statusColors(colors, overrides);

  const style = {
    '--color-background': colors.background,
    '--color-primary': colors.primary,
    '--color-accent': colors.accent,
    fontFamily: getFont(fontFamily).stack,
  } as CSSProperties;

  return (
    <figure className={classes.Preview} style={style} aria-label="Live preview">
      <div className={classes.Header}>
        <p>Friday, 30 October</p>
        <h1>Good morning!</h1>
      </div>

      <div className={classes.Search}>Search or type a URL</div>

      <h2 className={classes.Headline}>Applications</h2>
      <div className={classes.Grid}>
        {CATEGORIES.map((category) => (
          <div key={category.name}>
            <h3>{category.name}</h3>
            {category.apps.map((app) => (
              <div key={app.name} className={classes.App}>
                <div className={classes.AppIcon}>
                  <Icon icon={app.icon} />
                </div>
                <div className={classes.AppDetails}>
                  <h5>
                    {app.name}
                    <StatusDot
                      status={{
                        status: app.status,
                        detail: 'Preview',
                        since: SINCE,
                      }}
                      colors={dots}
                    />
                  </h5>
                  <span>{app.url}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <h2 className={classes.Headline}>Bookmarks</h2>
      <div className={classes.Grid}>
        <div>
          <h3>Links</h3>
          {BOOKMARKS.map((name) => (
            <p key={name} className={classes.Bookmark}>
              {name}
            </p>
          ))}
        </div>
      </div>
    </figure>
  );
};
