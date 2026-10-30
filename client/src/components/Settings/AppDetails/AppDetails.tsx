import { Fragment } from 'react';

// UI
import { Button, SettingsHeadline } from '../../UI';
import { AuthForm } from './AuthForm/AuthForm';
import classes from './AppDetails.module.css';

// Store
import { useSelector } from 'react-redux';
import { State } from '../../../store/reducers';

// Other
import { checkVersion } from '../../../utility';

export const AppDetails = (): JSX.Element => {
  const { isAuthenticated } = useSelector((state: State) => state.auth);

  return (
    <Fragment>
      <SettingsHeadline text="Authentication" />
      <AuthForm />

      {isAuthenticated && (
        <Fragment>
          <hr className={classes.separator} />

          <div>
            <SettingsHeadline text="App version" />
            <p className={classes.text}>
              <a
                href="https://github.com/pawelmalak/flame"
                target="_blank"
                rel="noreferrer"
              >
                Flame
              </a>{' '}
              version {import.meta.env.VITE_APP_VERSION}
            </p>

            <p className={classes.text}>
              See changelog{' '}
              <a
                href="https://github.com/pawelmalak/flame/blob/master/CHANGELOG.md"
                target="_blank"
                rel="noreferrer"
              >
                here
              </a>
            </p>

            <Button click={() => checkVersion(true)}>Check for updates</Button>
          </div>
        </Fragment>
      )}

      <hr className={classes.separator} />

      <div>
        <SettingsHeadline text="Credits" />
        <p className={classes.text}>
          App and bookmark icons picked from{' '}
          <a href="https://selfh.st/icons" target="_blank" rel="noreferrer">
            selfh.st/icons
          </a>{' '}
          are by selfh.st and licensed under{' '}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY 4.0
          </a>
          . Flame stores a copy of each icon you pick and sanitizes SVG files,
          which can change their markup. Logos are trademarks of their
          respective owners, are used only to identify their apps, and do not
          imply endorsement.
        </p>
      </div>
    </Fragment>
  );
};
