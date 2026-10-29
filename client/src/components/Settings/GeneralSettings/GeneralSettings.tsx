import { ChangeEvent, FormEvent, Fragment, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { bindActionCreators } from 'redux';

import { GeneralForm, Query } from '../../../interfaces';
import { actionCreators } from '../../../store';
import { State } from '../../../store/reducers';
import {
  DEFAULT_URL_SCHEMES,
  generalSettingsTemplate,
  inputHandler,
} from '../../../utility';
import searchQueries from '../../../utility/searchQueries.json';
import { Button, InputGroup, SettingsHeadline } from '../../UI';
import { CustomQueries } from './CustomQueries/CustomQueries';

export const GeneralSettings = (): JSX.Element => {
  const config = useSelector((state: State) => state.config);
  const appCategories = useSelector((state: State) => state.apps.categories);
  const bookmarkCategories = useSelector((state: State) => state.bookmarks.categories);

  const dispatch = useDispatch();
  const { updateConfig, sortApps, sortCategories, sortBookmarks } =
    bindActionCreators(actionCreators, dispatch);

  const queries = searchQueries.queries;

  // Initial state
  const [formData, setFormData] = useState<GeneralForm>(
    generalSettingsTemplate
  );

  // Get config
  useEffect(() => {
    setFormData({
      ...config.config,
    });
  }, [config]);

  // Form handler
  const formSubmitHandler = async (e: FormEvent) => {
    e.preventDefault();

    // Save settings
    await updateConfig(formData);

    // Sort entities with new settings
    if (formData.useOrdering !== config.config.useOrdering) {
      sortCategories();

      for (let { id } of appCategories) {
        sortApps(id);
      }

      for (let { id } of bookmarkCategories) {
        sortBookmarks(id);
      }
    }
  };

  // Input handler
  const inputChangeHandler = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    options?: { isNumber?: boolean; isBool?: boolean }
  ) => {
    inputHandler<GeneralForm>({
      e,
      options,
      setStateHandler: setFormData,
      state: formData,
    });
  };

  return (
    <Fragment>
      <form
        onSubmit={(e) => formSubmitHandler(e)}
        style={{ marginBottom: '30px' }}
      >
        {/* === GENERAL OPTIONS === */}
        <SettingsHeadline text="General" />
        {/* SORT TYPE */}
        <InputGroup>
          <label htmlFor="useOrdering">Sorting type</label>
          <select
            id="useOrdering"
            name="useOrdering"
            value={formData.useOrdering}
            onChange={(e) => inputChangeHandler(e)}
          >
            <option value="createdAt">By creation date</option>
            <option value="name">Alphabetical order</option>
            <option value="orderId">Custom order</option>
          </select>
        </InputGroup>

        {/* EXTRA URL SCHEMES */}
        <InputGroup>
          <label htmlFor="extraUrlSchemes">Additional URL schemes</label>
          <input
            type="text"
            id="extraUrlSchemes"
            name="extraUrlSchemes"
            placeholder="obsidian;vscode"
            value={formData.extraUrlSchemes}
            onChange={(e) => inputChangeHandler(e)}
          />
          <span>
            Links to apps and bookmarks may only use{' '}
            {DEFAULT_URL_SCHEMES.join(', ')}. Add more schemes separated with
            semicolon. javascript, data and similar schemes are always blocked
          </span>
        </InputGroup>

        {/* === APPS OPTIONS === */}
        <SettingsHeadline text="Apps" />
        {/* PIN APPS */}
        <InputGroup>
          <label htmlFor="pinAppsByDefault">
            Pin new applications by default
          </label>
          <select
            id="pinAppsByDefault"
            name="pinAppsByDefault"
            value={formData.pinAppsByDefault ? 1 : 0}
            onChange={(e) => inputChangeHandler(e, { isBool: true })}
          >
            <option value={1}>True</option>
            <option value={0}>False</option>
          </select>
        </InputGroup>

        {/* APPS OPPENING */}
        <InputGroup>
          <label htmlFor="appsSameTab">Open applications in the same tab</label>
          <select
            id="appsSameTab"
            name="appsSameTab"
            value={formData.appsSameTab ? 1 : 0}
            onChange={(e) => inputChangeHandler(e, { isBool: true })}
          >
            <option value={1}>True</option>
            <option value={0}>False</option>
          </select>
        </InputGroup>

        {/* === STATUS INDICATORS === */}
        <SettingsHeadline text="Status indicators" />
        <InputGroup>
          <label htmlFor="statusChecks">Show app status indicators</label>
          <select
            id="statusChecks"
            name="statusChecks"
            value={formData.statusChecks ? 1 : 0}
            onChange={(e) => inputChangeHandler(e, { isBool: true })}
          >
            <option value={1}>True</option>
            <option value={0}>False</option>
          </select>
          <span>
            The Flame server checks every app and shows a green or red dot next
            to it. Any HTTP answer below 500 counts as up. Apps can be excluded
            or given another check URL in their settings
          </span>
        </InputGroup>

        {formData.statusChecks && (
          <Fragment>
            <InputGroup>
              <label htmlFor="statusCheckInterval">
                Check interval (seconds)
              </label>
              <input
                type="number"
                id="statusCheckInterval"
                name="statusCheckInterval"
                min={10}
                max={86400}
                value={formData.statusCheckInterval}
                onChange={(e) => inputChangeHandler(e, { isNumber: true })}
              />
            </InputGroup>

            <InputGroup>
              <label htmlFor="statusCheckTimeout">
                Check timeout (seconds)
              </label>
              <input
                type="number"
                id="statusCheckTimeout"
                name="statusCheckTimeout"
                min={1}
                max={60}
                value={formData.statusCheckTimeout}
                onChange={(e) => inputChangeHandler(e, { isNumber: true })}
              />
            </InputGroup>

            <InputGroup>
              <label htmlFor="statusCheckDocker">
                Use the container state of Docker apps
              </label>
              <select
                id="statusCheckDocker"
                name="statusCheckDocker"
                value={formData.statusCheckDocker ? 1 : 0}
                onChange={(e) => inputChangeHandler(e, { isBool: true })}
              >
                <option value={1}>True</option>
                <option value={0}>False</option>
              </select>
              <span>
                Apps found by the Docker integration are up while their
                container runs and isn't unhealthy, instead of getting an HTTP
                check. Reads GET /containers/json from the Docker host
              </span>
            </InputGroup>
          </Fragment>
        )}

        {/* === BOOKMARKS OPTIONS === */}
        <SettingsHeadline text="Bookmarks" />
        {/* PIN CATEGORIES */}
        <InputGroup>
          <label htmlFor="pinCategoriesByDefault">
            Pin new categories by default
          </label>
          <select
            id="pinCategoriesByDefault"
            name="pinCategoriesByDefault"
            value={formData.pinCategoriesByDefault ? 1 : 0}
            onChange={(e) => inputChangeHandler(e, { isBool: true })}
          >
            <option value={1}>True</option>
            <option value={0}>False</option>
          </select>
        </InputGroup>

        {/* BOOKMARKS OPPENING */}
        <InputGroup>
          <label htmlFor="bookmarksSameTab">
            Open bookmarks in the same tab
          </label>
          <select
            id="bookmarksSameTab"
            name="bookmarksSameTab"
            value={formData.bookmarksSameTab ? 1 : 0}
            onChange={(e) => inputChangeHandler(e, { isBool: true })}
          >
            <option value={1}>True</option>
            <option value={0}>False</option>
          </select>
        </InputGroup>

        {/* === SEARCH OPTIONS === */}
        <SettingsHeadline text="Search" />
        <InputGroup>
          <label htmlFor="defaultSearchProvider">Primary search provider</label>
          <select
            id="defaultSearchProvider"
            name="defaultSearchProvider"
            value={formData.defaultSearchProvider}
            onChange={(e) => inputChangeHandler(e)}
          >
            {[...queries, ...config.customQueries].map((query: Query, idx) => {
              const isCustom = idx >= queries.length;

              return (
                <option key={idx} value={query.prefix}>
                  {isCustom && '+'} {query.name}
                </option>
              );
            })}
          </select>
        </InputGroup>

        {formData.defaultSearchProvider === 'l' && (
          <InputGroup>
            <label htmlFor="secondarySearchProvider">
              Secondary search provider
            </label>
            <select
              id="secondarySearchProvider"
              name="secondarySearchProvider"
              value={formData.secondarySearchProvider}
              onChange={(e) => inputChangeHandler(e)}
            >
              {[...queries, ...config.customQueries].map((query: Query, idx) => {
                const isCustom = idx >= queries.length;

                return (
                  <option key={idx} value={query.prefix}>
                    {isCustom && '+'} {query.name}
                  </option>
                );
              })}
            </select>
            <span>
              Will be used when "Local search" is primary search provider and
              there are not any local results
            </span>
          </InputGroup>
        )}

        <InputGroup>
          <label htmlFor="searchSameTab">
            Open search results in the same tab
          </label>
          <select
            id="searchSameTab"
            name="searchSameTab"
            value={formData.searchSameTab ? 1 : 0}
            onChange={(e) => inputChangeHandler(e, { isBool: true })}
          >
            <option value={1}>True</option>
            <option value={0}>False</option>
          </select>
        </InputGroup>

        <Button>Save changes</Button>
      </form>

      {/* CUSTOM QUERIES */}
      <SettingsHeadline text="Custom search providers" />
      <CustomQueries />
    </Fragment>
  );
};
