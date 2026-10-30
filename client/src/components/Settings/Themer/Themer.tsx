import { Fragment } from 'react';
import { useSelector } from 'react-redux';

import { State } from '../../../store/reducers';
import { SettingsHeadline, Spinner } from '../../UI';
import { ThemeBuilder } from './ThemeBuilder/ThemeBuilder';
import { ThemeGrid } from './ThemeGrid/ThemeGrid';
import { ThemeOptions } from './ThemeOptions/ThemeOptions';
import classes from './Themer.module.css';

const AUTOMATIC_NOTE = {
  system: "The theme follows your device's light or dark setting.",
  time: 'The theme switches between light and dark by time of day.',
};

export const Themer = (): JSX.Element => {
  const themes = useSelector((state: State) => state.theme.themes);
  const userThemes = useSelector((state: State) => state.theme.userThemes);
  const themeMode = useSelector(
    (state: State) => state.config.config.themeMode
  );
  const isAuthenticated = useSelector(
    (state: State) => state.auth.isAuthenticated
  );

  const customThemesEl = (
    <Fragment>
      <SettingsHeadline text="User themes" />
      <ThemeBuilder themes={userThemes} />
    </Fragment>
  );

  return (
    <Fragment>
      <SettingsHeadline text="App themes" />
      {themeMode !== 'manual' && themeMode in AUTOMATIC_NOTE && (
        <p className={classes.Note}>
          {AUTOMATIC_NOTE[themeMode]} Picking a theme here applies it until the
          next switch.
        </p>
      )}
      {!themes.length ? <Spinner /> : <ThemeGrid themes={themes} />}

      {!userThemes.length ? isAuthenticated && customThemesEl : customThemesEl}

      {isAuthenticated && <ThemeOptions />}
    </Fragment>
  );
};
