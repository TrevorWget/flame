import { FormEvent, Fragment, useEffect, useState, useRef } from 'react';

// Redux
import { useSelector, useDispatch } from 'react-redux';
import { bindActionCreators } from 'redux';
import { actionCreators } from '../../../../store';
import { State } from '../../../../store/reducers';
import { parseTokenExpire } from '../../../../utility';

// Other
import { InputGroup, Button } from '../../../UI';
import classes from '../AppDetails.module.css';

export const AuthForm = (): JSX.Element => {
  const { isAuthenticated, expiresAt } = useSelector(
    (state: State) => state.auth
  );

  const dispatch = useDispatch();
  const { login, logout, logoutAll } = bindActionCreators(
    actionCreators,
    dispatch
  );

  const [tokenExpires, setTokenExpires] = useState('');
  const [formData, setFormData] = useState({
    password: '',
    duration: '14d',
  });

  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (expiresAt) {
      setTokenExpires(parseTokenExpire(expiresAt));
    }
  }, [expiresAt]);

  const logoutAllHandler = () => {
    if (window.confirm('Log out of Flame on every device, including this one?')) {
      logoutAll();
    }
  };

  const formHandler = (e: FormEvent) => {
    e.preventDefault();
    login(formData);
    setFormData({
      password: '',
      duration: '14d',
    });
  };

  return (
    <Fragment>
      {!isAuthenticated ? (
        <form onSubmit={formHandler}>
          <InputGroup>
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              placeholder="••••••"
              autoComplete="current-password"
              ref={passwordInputRef}
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
            />
            <span>
              See
              <a
                href="https://github.com/pawelmalak/flame/wiki/Authentication"
                target="blank"
              >
                {` project wiki `}
              </a>
              to read more about authentication
            </span>
          </InputGroup>

          <InputGroup>
            <label htmlFor="duration">Session duration</label>
            <select
              id="duration"
              name="duration"
              value={formData.duration}
              onChange={(e) =>
                setFormData({ ...formData, duration: e.target.value })
              }
            >
              <option value="1h">1 hour</option>
              <option value="1d">1 day</option>
              <option value="14d">2 weeks</option>
              <option value="30d">1 month</option>
              <option value="1y">1 year</option>
            </select>
          </InputGroup>

          <Button>Login</Button>
        </form>
      ) : (
        <div>
          <p className={classes.text}>
            You are logged in. Your session will expire{' '}
            <span>{tokenExpires}</span>
          </p>
          <div className={classes.buttons}>
            <Button click={logout}>Logout</Button>
            <Button click={logoutAllHandler}>Log out all sessions</Button>
          </div>
        </div>
      )}
    </Fragment>
  );
};
