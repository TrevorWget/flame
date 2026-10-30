import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { bindActionCreators } from 'redux';

import { App, Category, NewApp } from '../../../interfaces';
import { actionCreators } from '../../../store';
import { State } from '../../../store/reducers';
import { inputHandler, newAppTemplate, normalizeUrl } from '../../../utility';
import {
  followsTheme,
  NO_THEMED_ICONS,
  themedIcon,
  useIsDarkTheme,
} from '../../../utility/themedIcon';
import { Button, FetchIcon, InputGroup, ModalForm, SelfhstPicker } from '../../UI';
import classes from './Form.module.css';

// Redux
// Typescript
// UI
// CSS
// Utils
interface Props {
  modalHandler: () => void;
  app?: App;
}

export const AppsForm = ({
  app,
  modalHandler,
}: Props): JSX.Element => {
  const { categories } = useSelector((state: State) => state.apps);
  const { config } = useSelector((state: State) => state.config);
  const isDark = useIsDarkTheme();

  const dispatch = useDispatch();
  const { addApp, updateApp, createNotification } =
    bindActionCreators(actionCreators, dispatch);

  const [useCustomIcon, toggleUseCustomIcon] = useState<boolean>(false);
  const [customIcon, setCustomIcon] = useState<File | null>(null);

  const [formData, setFormData] = useState<NewApp>(newAppTemplate);

  // Load app data if provided for editing
  useEffect(() => {
    if (app) {
      setFormData({ ...app, statusUrl: app.statusUrl ?? '' });
    } else {
      setFormData(newAppTemplate);
    }
  }, [app]);

  const inputChangeHandler = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    options?: { isNumber?: boolean; isBool?: boolean }
  ) => {
    inputHandler<NewApp>({
      e,
      options,
      setStateHandler: setFormData,
      state: formData,
    });
  };

  const fileChangeHandler = (e: ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files) {
      setCustomIcon(e.target.files[0]);
    }
  };

  // Apps form handler
  const formSubmitHandler = (e: FormEvent): void => {
    e.preventDefault();

    for (let field of ['name', 'url', 'icon'] as const) {
      if (/^ +$/.test(formData[field])) {
        createNotification({
          title: 'Error',
          message: `Field cannot be empty: ${field}`,
        });

        return;
      }
    }

    if (!normalizeUrl(formData.url, config.extraUrlSchemes)) {
      createNotification({
        title: 'Error',
        message: 'Internal URL is invalid or its scheme is not allowed',
      });

      return;
    }

    const externalUrl = formData.externalUrl?.trim() ?? '';

    if (externalUrl && !normalizeUrl(externalUrl, config.extraUrlSchemes)) {
      createNotification({
        title: 'Error',
        message: 'External URL is invalid or its scheme is not allowed',
      });

      return;
    }

    const createFormData = (): FormData => {
      const data = new FormData();
      if (customIcon) {
        data.append('icon', customIcon);
      }

      data.append('name', formData.name);
      data.append('description', formData.description);
      data.append('url', formData.url);
      data.append('externalUrl', externalUrl);
      data.append('preferredUrl', formData.preferredUrl ?? 'internal');
      data.append('categoryId', `${formData.categoryId}`);
      data.append('isPublic', `${formData.isPublic ? 1 : 0}`);
      data.append('statusCheck', `${formData.statusCheck ? 1 : 0}`);
      data.append('statusUrl', formData.statusUrl ?? '');

      return data;
    };

    const checkCategory = (): boolean => {
      if (formData.categoryId < 0) {
        createNotification({
          title: 'Error',
          message: 'Please select category',
        });

        return false;
      }

      return true;
    };

    if (!app) {
      // add new app
      if (!checkCategory()) return;

      if (formData.categoryId < 0) {
        createNotification({
          title: 'Error',
          message: 'Please select category',
        });
        return;
      }

      if (customIcon) {
        const data = createFormData();
        addApp(data);
      } else {
        addApp({ ...formData, externalUrl });
      }

      setFormData({
        ...newAppTemplate,
        categoryId: formData.categoryId,
        isPublic: formData.isPublic,
      });
    } else {
      // update
      if (!checkCategory()) return;

      if (customIcon) {
        const data = createFormData();
        updateApp(app.id, data, {
          prev: app.categoryId,
          curr: formData.categoryId,
        });
      } else {
        updateApp(app.id, { ...formData, externalUrl }, {
          prev: app.categoryId,
          curr: formData.categoryId,
        });
      }

      modalHandler();
    }

    setFormData({ ...newAppTemplate, categoryId: formData.categoryId });
    setCustomIcon(null);
  };

  return (
    <ModalForm modalHandler={modalHandler} formHandler={formSubmitHandler}>
      {/* NAME */}
      <InputGroup>
        <label htmlFor="name">App name</label>
        <input
          type="text"
          name="name"
          id="name"
          placeholder="Reddit"
          required
          value={formData.name}
          onChange={(e) => inputChangeHandler(e)}
        />
      </InputGroup>

      {/* URL */}
      <InputGroup>
        <label htmlFor="url">Internal URL</label>
        <input
          type="text"
          name="url"
          id="url"
          placeholder="192.0.2.10:8096"
          required
          value={formData.url}
          onChange={(e) => inputChangeHandler(e)}
        />
      </InputGroup>

      {/* EXTERNAL URL */}
      <InputGroup>
        <label htmlFor="externalUrl">External URL</label>
        <input
          type="text"
          name="externalUrl"
          id="externalUrl"
          placeholder="jellyfin.example.com"
          value={formData.externalUrl ?? ''}
          onChange={(e) => inputChangeHandler(e)}
        />
        <span>Optional - e.g. the address used outside your network</span>
      </InputGroup>

      {/* PREFERRED URL */}
      <InputGroup>
        <label htmlFor="preferredUrl">Open with</label>
        <select
          id="preferredUrl"
          name="preferredUrl"
          value={formData.preferredUrl ?? 'internal'}
          onChange={(e) => inputChangeHandler(e)}
        >
          <option value="internal">Internal URL</option>
          <option value="external">External URL</option>
        </select>
        <span>
          The URL that is displayed and opened. If it is empty, the other one
          is used
        </span>
      </InputGroup>

      {/* CATEGORY */}
      <InputGroup>
        <label htmlFor="categoryId">App Category</label>
        <select
          name="categoryId"
          id="categoryId"
          required
          onChange={(e) => inputChangeHandler(e, { isNumber: true })}
          value={formData.categoryId}
        >
          <option value={-1}>Select category</option>
          {categories.map((category: Category): JSX.Element => {
            return (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            );
          })}
        </select>
      </InputGroup>
      
      {/* DESCRIPTION */}
      <InputGroup>
        <label htmlFor="description">App description</label>
        <input
          type="text"
          name="description"
          id="description"
          placeholder="My self-hosted app"
          value={formData.description}
          onChange={(e) => inputChangeHandler(e)}
        />
        <span>
          Optional - If description is not set, the URL it opens will be
          displayed
        </span>
      </InputGroup>

      {/* ICON */}
      {!useCustomIcon ? (
        // mdi
        <InputGroup>
          <label htmlFor="icon">App icon</label>
          <input
            type="text"
            name="icon"
            id="icon"
            placeholder="book-open-outline"
            value={formData.icon}
            onChange={(e) => {
              const icon = e.target.value;
              setFormData((prev) => ({ ...prev, icon, ...NO_THEMED_ICONS }));
            }}
          />
          <span>
            Use icon name from MDI or pass a valid URL.
            <a href="https://pictogrammers.com/library/mdi/" target="blank">
              {' '}
              Click here for reference
            </a>
          </span>
          <FetchIcon
            url={formData.url}
            icon={formData.icon}
            previewIcon={themedIcon(formData, isDark)}
            onFetched={(icon) =>
              setFormData((prev) => ({ ...prev, icon, ...NO_THEMED_ICONS }))
            }
          />
          <SelfhstPicker
            name={formData.name}
            icon={formData.icon}
            followsTheme={followsTheme(formData)}
            onPicked={(picked) => setFormData((prev) => ({ ...prev, ...picked }))}
          />
          <span
            onClick={() => toggleUseCustomIcon(!useCustomIcon)}
            className={classes.Switch}
          >
            Switch to custom icon upload
          </span>
        </InputGroup>
      ) : (
        // custom
        <InputGroup>
          <label htmlFor="icon">App Icon (optional)</label>
          <input
            type="file"
            name="icon"
            id="icon"
            onChange={(e) => fileChangeHandler(e)}
            accept=".jpg,.jpeg,.png,.svg,.ico,.webp"
          />
          <span
            onClick={() => {
              setCustomIcon(null);
              toggleUseCustomIcon(!useCustomIcon);
            }}
            className={classes.Switch}
          >
            Switch to MDI
          </span>
        </InputGroup>
      )}

      {/* VISIBILTY */}
      <InputGroup>
        <label htmlFor="isPublic">App visibility</label>
        <select
          id="isPublic"
          name="isPublic"
          value={formData.isPublic ? 1 : 0}
          onChange={(e) => inputChangeHandler(e, { isBool: true })}
        >
          <option value={1}>Visible (anyone can access it)</option>
          <option value={0}>Hidden (authentication required)</option>
        </select>
      </InputGroup>

      {/* STATUS INDICATOR */}
      {config.statusChecks && (
        <InputGroup>
          <label htmlFor="statusCheck">Status indicator</label>
          <select
            id="statusCheck"
            name="statusCheck"
            value={formData.statusCheck ? 1 : 0}
            onChange={(e) => inputChangeHandler(e, { isBool: true })}
          >
            <option value={1}>Check this app</option>
            <option value={0}>Don't check this app</option>
          </select>
        </InputGroup>
      )}

      {config.statusChecks && formData.statusCheck && (
        <InputGroup>
          <label htmlFor="statusUrl">Status check URL</label>
          <input
            type="text"
            name="statusUrl"
            id="statusUrl"
            placeholder="http://192.0.2.10:8096/health"
            value={formData.statusUrl ?? ''}
            onChange={(e) => inputChangeHandler(e)}
          />
          <span>
            Optional - checked instead of the app URL, e.g. when the app URL
            can't be reached from the Flame server. Docker apps with a check
            URL get an HTTP check instead of their container state
          </span>
        </InputGroup>
      )}

      <Button>{app ? 'Update app' : 'Add new app'}</Button>
    </ModalForm>
  );
};
