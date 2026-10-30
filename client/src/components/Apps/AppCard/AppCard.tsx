import { useDispatch, useSelector } from 'react-redux';
import { bindActionCreators } from 'redux';

import { App, AppStatuses, Category } from '../../../interfaces';
import { actionCreators } from '../../../store';
import { State } from '../../../store/reducers';
import {
  AppLayout,
  appSubtitle,
  iconParser,
  isImage,
  isSvg,
  isUrl,
  urlParser,
} from '../../../utility';
import { resolveAppUrl } from '../../../utility/appUrl';
import { useCollapsibleCategory } from '../../Home/CollapsibleCategory/CollapsibleCategory';
import { Icon, SvgIcon } from '../../UI';
import { useAppLayout } from '../AppGrid/useAppLayout';
import { StatusDot } from '../AppStatus/StatusDot';
import classes from './AppCard.module.css';

interface Props {
  category: Category;
  fromHomepage?: boolean;
  statuses?: AppStatuses;
  collapsible?: boolean;
  // Instead of the page's saved layout, e.g. to preview unsaved settings
  layout?: AppLayout;
}

// Longer categories span the whole AppGrid and lay their apps out in as many
// columns as fit instead of stacking them in one
export const WIDE_CATEGORY_MIN_APPS = 9;

const AppIcon = ({ app, isTile }: { app: App; isTile: boolean }) => {
  const { icon, name } = app;

  if (!icon) {
    return isTile ? (
      <div className={classes.AppIcon} aria-hidden="true">
        <span className={classes.IconLetter}>{name.charAt(0)}</span>
      </div>
    ) : null;
  }

  if (isImage(icon)) {
    const source = isUrl(icon) ? icon : `/uploads/${icon}`;

    return (
      <div className={classes.AppIcon}>
        <img src={source} alt={`${name} icon`} className={classes.CustomIcon} />
      </div>
    );
  }

  if (isSvg(icon)) {
    const source = isUrl(icon) ? icon : `/uploads/${icon}`;

    return (
      <div className={classes.AppIcon}>
        <SvgIcon
          src={source}
          alt={`${name} icon`}
          fill="var(--color-primary)"
          className={classes.AppIconSvg}
        />
      </div>
    );
  }

  return (
    <div className={classes.AppIcon}>
      <Icon icon={iconParser(icon)} />
    </div>
  );
};

export const AppCard = (props: Props): JSX.Element => {
  const {
    category,
    fromHomepage = false,
    statuses = {},
    collapsible = false,
  } = props;

  const config = useSelector((state: State) => state.config.config);
  const isAuthenticated = useSelector((state: State) => state.auth.isAuthenticated);
  const { layout } = useAppLayout(fromHomepage ? 'home' : 'apps', props.layout);

  const dispatch = useDispatch();
  const { setEditCategory } = bindActionCreators(actionCreators, dispatch);

  const collapse = useCollapsibleCategory(category, collapsible);

  const isWide = category.apps.length >= WIDE_CATEGORY_MIN_APPS;
  const isTiles = layout.tileStyle === 'tiles';

  return (
    <div
      className={[
        classes.AppCard,
        isWide && classes.WideAppCard,
        isTiles && classes.TileAppCard,
        collapse.className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <h3
        className={
          fromHomepage || !isAuthenticated ? '' : classes.AppHeader
        }
        onClick={() => {
          if (!fromHomepage && isAuthenticated) {
            setEditCategory(category);
          }
        }}
      >
        {collapse.title}
      </h3>

      <div
        className={`${classes.Apps} ${collapse.contentClassName}`}
        id={collapse.contentId}
      >
        {category.apps.map((app: App) => {
          const [displayUrl, redirectUrl] = urlParser(
            resolveAppUrl(app).url,
            config.extraUrlSchemes
          );
          const subtitle = appSubtitle(app.description, displayUrl, layout);

          return (
            <a
              href={redirectUrl}
              target={config.appsSameTab ? '' : '_blank'}
              rel="noreferrer"
              key={`app-${app.id}`}
              // Tiles cut long names and subtitles short
              title={isTiles ? [app.name, subtitle].filter(Boolean).join('\n') : undefined}
            >
              <AppIcon app={app} isTile={isTiles} />
              <div className={classes.AppCardDetails}>
                <h5>
                  <span className={classes.AppName}>{app.name}</span>
                  {!layout.hideStatusDots && (
                    <StatusDot status={statuses[app.id]} />
                  )}
                </h5>
                {subtitle && <span>{subtitle}</span>}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
};
