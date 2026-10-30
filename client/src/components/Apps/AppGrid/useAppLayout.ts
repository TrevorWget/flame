import { CSSProperties, useMemo } from 'react';
import { useSelector } from 'react-redux';

import { State } from '../../../store/reducers';
import { AppLayout, AppLayoutPage, appLayout, appLayoutStyle } from '../../../utility';
import classes from './AppGrid.module.css';

interface AppLayoutProps {
  layout: AppLayout;
  // For the element holding the category cards
  className: string;
  style: CSSProperties;
}

/** The saved app layout of a page, or `override` to preview unsaved settings */
export const useAppLayout = (
  page: AppLayoutPage,
  override?: AppLayout
): AppLayoutProps => {
  const config = useSelector((state: State) => state.config.config);
  const saved = useMemo(() => appLayout(config, page), [config, page]);
  const layout = override || saved;

  return useMemo(
    () => ({
      layout,
      className: layout.columns ? classes.FixedColumns : '',
      style: appLayoutStyle(layout),
    }),
    [layout]
  );
};
