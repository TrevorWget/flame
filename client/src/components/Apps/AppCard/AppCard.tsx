import { Fragment } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { bindActionCreators } from 'redux';

import { App, Category } from '../../../interfaces';
import { actionCreators } from '../../../store';
import { State } from '../../../store/reducers';
import { iconParser, isImage, isSvg, isUrl, urlParser } from '../../../utility';
import { useCollapsibleCategory } from '../../Home/CollapsibleCategory/CollapsibleCategory';
import { Icon, SvgIcon } from '../../UI';
import classes from './AppCard.module.css';

interface Props {
  category: Category;
  fromHomepage?: boolean;
  collapsible?: boolean;
}

// Longer categories span the whole AppGrid and lay their apps out in as many
// columns as fit instead of stacking them in one
export const WIDE_CATEGORY_MIN_APPS = 9;

export const AppCard = (props: Props): JSX.Element => {
  const { category, fromHomepage = false, collapsible = false } = props;

  const config = useSelector((state: State) => state.config.config);
  const isAuthenticated = useSelector((state: State) => state.auth.isAuthenticated);

  const dispatch = useDispatch();
  const { setEditCategory } = bindActionCreators(actionCreators, dispatch);

  const collapse = useCollapsibleCategory(category, collapsible);

  const isWide = category.apps.length >= WIDE_CATEGORY_MIN_APPS;

  return (
    <div
      className={[
        classes.AppCard,
        isWide && classes.WideAppCard,
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
            app.url,
            config.extraUrlSchemes
          );

          let iconEl: JSX.Element = <Fragment></Fragment>;

          if (app.icon) {
            const { icon, name } = app;

            if (isImage(icon)) {
              const source = isUrl(icon) ? icon : `/uploads/${icon}`;

              iconEl = (
                <div className={classes.AppIcon}>
                  <img
                    src={source}
                    alt={`${name} icon`}
                    className={classes.CustomIcon}
                  />
                </div>
              );
            } else if (isSvg(icon)) {
              const source = isUrl(icon) ? icon : `/uploads/${icon}`;

              iconEl = (
                <div className={classes.AppIcon}>
                  <SvgIcon
                    src={source}
                    alt={`${name} icon`}
                    fill="var(--color-primary)"
                    className={classes.AppIconSvg}
                  />
                </div>
              );
            } else {
              iconEl = (
                <div className={classes.AppIcon}>
                  <Icon icon={iconParser(icon)} />
                </div>
              );
            }
          }

          return (
            <a
              href={redirectUrl}
              target={config.appsSameTab ? '' : '_blank'}
              rel="noreferrer"
              key={`app-${app.id}`}
            >
              {app.icon && iconEl}              
              <div className={classes.AppCardDetails}>
                  <h5>{app.name}</h5>
                  <span>{!app.description.length ? displayUrl : app.description}</span>
                </div>
            </a>
          );
        })}
      </div>
    </div>
  );
};
