import { useMemo } from 'react';
import { shallowEqual, useSelector } from 'react-redux';

import { State } from '../../../store/reducers';
import { StatusColors, statusColors } from '../../../utility';

/** Dot colors for the active theme and the custom colors from the settings */
export const useStatusColors = (): StatusColors => {
  const theme = useSelector((state: State) => state.theme.activeTheme.colors);
  const overrides = useSelector(
    ({ config: { config } }: State) => ({
      statusColorUp: config.statusColorUp,
      statusColorUnhealthy: config.statusColorUnhealthy,
      statusColorDown: config.statusColorDown,
    }),
    shallowEqual
  );

  return useMemo(() => statusColors(theme, overrides), [theme, overrides]);
};
