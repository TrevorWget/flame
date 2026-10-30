import {
  FormEvent,
  Fragment,
  MouseEvent,
  useEffect,
  useState,
  useRef,
} from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';

// Redux
import { useSelector, useDispatch } from 'react-redux';
import { bindActionCreators } from 'redux';
import { actionCreators } from '../../../../store';
import { createNotification } from '../../../../store/action-creators';
import { State } from '../../../../store/reducers';
import { ApiResponse, AuthProviders } from '../../../../interfaces';
import {
  oidcLoginUrl,
  parseTokenExpire,
  ssoErrorMessage,
} from '../../../../utility';

// Other
import { InputGroup, Button } from '../../../UI';
import classes from '../AppDetails.module.css';

export const AuthForm = (): JSX.Element => {
  const { isAuthenticated, expiresAt, method, user, logoutUrl } = useSelector(
    (state: State) => state.auth
  );

  const dispatch = useDispatch();
  const { login, logout, logoutAll } = bindActionCreators(
    actionCreators,
    dispatch
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [tokenExpires, setTokenExpires] = useState('');
  const [formData, setFormData] = useState({
    password: '',
    duration: '14d',
  });

  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, [providers]);

  useEffect(() => {
    if (isAuthenticated) return;

    axios
      .get<ApiResponse<AuthProviders>>('/api/auth/providers')
      .then((res) => setProviders(res.data.data))
      .catch(() => setProviders({ password: true, oidc: null }));
  }, [isAuthenticated]);

  // Set by the server when an OIDC login fails
  const ssoError = searchParams.get('ssoError');
  // Effects run twice in StrictMode, before the cleared URL is rendered
  const reportedSsoError = useRef<string | null>(null);

  useEffect(() => {
    if (!ssoError || reportedSsoError.current === ssoError) return;

    reportedSsoError.current = ssoError;
    dispatch<any>(
      createNotification({ title: 'Error', message: ssoErrorMessage(ssoError) })
    );
    setSearchParams({}, { replace: true });
  }, [ssoError, dispatch, setSearchParams]);

  useEffect(() => {
    if (expiresAt) {
      setTokenExpires(parseTokenExpire(expiresAt));
    }
  }, [expiresAt]);

  const logoutAllHandler = () => {
    if (
      window.confirm('Log out of Flame on every device, including this one?')
    ) {
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

  const oidcHandler = (e: MouseEvent) => {
    e.preventDefault();
    window.location.assign(oidcLoginUrl(formData.duration));
  };

  // Without any other way in, the password form explains why login is disabled
  const showPassword = !providers || providers.password || !providers.oidc;

  const sessionText = () => {
    switch (method) {
      case 'proxy':
        return (
          <>
            You are logged in as <span>{user}</span> through your reverse proxy.
          </>
        );
      case 'oidc':
        return (
          <>
            You are logged in as <span>{user}</span> with single sign-on. Your
            session will expire <span>{tokenExpires}</span>
          </>
        );
      default:
        return (
          <>
            You are logged in. Your session will expire{' '}
            <span>{tokenExpires}</span>
          </>
        );
    }
  };

  return (
    <Fragment>
      {!isAuthenticated ? (
        <form onSubmit={formHandler}>
          {showPassword && (
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
                See the{' '}
                <a
                  href="https://github.com/TrevorWget/flame/blob/master/docs/authentication.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  authentication docs
                </a>{' '}
                to read more about authentication
              </span>
            </InputGroup>
          )}

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

          <div className={classes.buttons}>
            {showPassword && <Button>Login</Button>}
            {providers?.oidc && (
              <Button click={oidcHandler}>
                Log in with {providers.oidc.name}
              </Button>
            )}
          </div>
        </form>
      ) : (
        <div>
          <p className={classes.text}>{sessionText()}</p>
          <div className={classes.buttons}>
            {(method !== 'proxy' || logoutUrl) && (
              <Button click={logout}>Logout</Button>
            )}
            {method !== 'proxy' && (
              <Button click={logoutAllHandler}>Log out all sessions</Button>
            )}
          </div>
        </div>
      )}
    </Fragment>
  );
};
