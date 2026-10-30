import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';

import { Category } from '../../../interfaces';
import { State } from '../../../store/reducers';
import { appLayoutKey } from '../../../utility';
import { useMasonry } from '../../Home/Masonry/useMasonry';
import { Message } from '../../UI';
import { AppCard, WIDE_CATEGORY_MIN_APPS } from '../AppCard/AppCard';
import { useAppStatuses } from '../AppStatus/useAppStatuses';
import classes from './AppGrid.module.css';
import { useAppLayout } from './useAppLayout';

interface Props {
  categories: Category[];
  totalCategories?: number;
  searching: boolean;
  fromHomepage?: boolean;
}

export const AppGrid = (props: Props): JSX.Element => {
  const {
    categories,
    totalCategories,
    searching,
    fromHomepage = false,
  } = props;

  const config = useSelector((state: State) => state.config.config);
  const appLayout = useAppLayout(fromHomepage ? 'home' : 'apps');
  const { layout } = appLayout;
  const statuses = useAppStatuses(!layout.hideStatusDots);

  const shouldBeShown = (category: Category) => {
    return !config.hideEmptyCategories || category.apps.length > 0 || !fromHomepage
  }

  const shown = categories.filter(shouldBeShown);
  const masonry = useMasonry<HTMLDivElement>(
    fromHomepage,
    shown.map(({ apps }) => apps.length >= WIDE_CATEGORY_MIN_APPS),
    appLayoutKey(layout)
  );

  let apps: JSX.Element;

  if (categories.length && categories.some(shouldBeShown)) {
    if (searching && !categories[0].apps.length) {
      apps = <Message>No apps match your search criteria</Message>;
    } else {
      apps = (
        <div
          className={[classes.AppGrid, appLayout.className, masonry.className]
            .filter(Boolean)
            .join(' ')}
          style={appLayout.style}
          ref={masonry.ref}
        >
        {shown.map(
            (category: Category): JSX.Element => (
              <AppCard
                category={category}
                fromHomepage={fromHomepage}
                statuses={statuses}
                collapsible={fromHomepage && !searching}
                layout={layout}
                key={category.id}
              />
            )
          )}
        </div>
      );
    }
  } else {
    if (totalCategories && !config.hideEmptyCategories) {
      apps = (
        <Message>
          There are no pinned categories. You can pin them from the{' '}
          <Link to="/applications">/applications</Link> menu
        </Message>
      );
    } else {
      apps = (
        <Message>
          You don't have any apps. You can add a new one from{' '}
          <Link to="/applications">/applications</Link> menu
        </Message>
      );
    }
  }

  return apps;
};
