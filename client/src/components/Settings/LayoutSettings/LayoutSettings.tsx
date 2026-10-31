import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { bindActionCreators } from 'redux';

import { App, AppStatuses, Category, LayoutSettingsForm } from '../../../interfaces';
import { actionCreators } from '../../../store';
import { State } from '../../../store/reducers';
import {
  MAX_APP_COLUMNS,
  MAX_ICON_SCALE,
  MIN_ICON_SCALE,
  appLayout,
  inputHandler,
  layoutSettingsTemplate,
} from '../../../utility';
import { AppCard } from '../../Apps/AppCard/AppCard';
import { useAppLayout } from '../../Apps/AppGrid/useAppLayout';
import { Button, InputGroup, SettingsHeadline } from '../../UI';
import classes from './LayoutSettings.module.css';

// Only the layout keys, with values the server accepts
export const pickLayoutSettings = (config: Partial<LayoutSettingsForm>): LayoutSettingsForm => {
  const { columns: homeAppColumns, ...layout } = appLayout(config, 'home');

  return {
    appTileStyle: layout.tileStyle,
    appDensity: layout.density,
    appIconScale: layout.iconScale,
    homeAppColumns,
    appsPageColumns: appLayout(config, 'apps').columns,
    hideAppUrls: layout.hideUrls,
    hideAppDescriptions: layout.hideDescriptions,
    hideStatusDots: layout.hideStatusDots,
  };
};

const COLUMN_OPTIONS = Array.from({ length: MAX_APP_COLUMNS }, (_, i) => i + 1);

const model = { createdAt: new Date(), updatedAt: new Date() };
const since = model.createdAt.toISOString();

const previewApp = (id: number, name: string, icon: string, fields: Partial<App> = {}): App => ({
  ...model,
  id,
  name,
  url: `http://${name.toLowerCase()}.lan`,
  categoryId: 0,
  icon,
  isPublic: true,
  description: '',
  statusCheck: true,
  statusUrl: null,
  orderId: id,
  isPinned: true,
  ...fields,
});

const PREVIEW_CATEGORY: Category = {
  ...model,
  id: 0,
  name: 'Preview',
  type: 'apps',
  isPublic: true,
  isPinned: true,
  orderId: 0,
  bookmarks: [],
  apps: [
    previewApp(-1, 'Jellyfin', 'filmstrip', { description: 'Movies and shows' }),
    previewApp(-2, 'Sonarr', 'television-classic'),
    previewApp(-3, 'Home Assistant', 'home-assistant'),
    previewApp(-4, 'Router', 'router-wireless', { url: '192.0.2.1' }),
  ],
};

const PREVIEW_STATUSES: AppStatuses = {
  [-1]: { status: 'up', detail: 'Preview', since },
  [-2]: { status: 'unhealthy', detail: 'Preview', since },
  [-3]: { status: 'up', detail: 'Preview', since },
  [-4]: { status: 'down', detail: 'Preview', since },
};

const BoolSelect = ({
  id,
  label,
  value,
  onChange,
}: {
  id: keyof LayoutSettingsForm;
  label: string;
  value: boolean;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
}) => (
  <InputGroup>
    <label htmlFor={id}>{label}</label>
    <select id={id} name={id} value={value ? 1 : 0} onChange={onChange}>
      <option value={1}>True</option>
      <option value={0}>False</option>
    </select>
  </InputGroup>
);

export const LayoutSettings = (): JSX.Element => {
  const { loading, config } = useSelector((state: State) => state.config);

  const dispatch = useDispatch();
  const { updateConfig } = bindActionCreators(actionCreators, dispatch);

  const [formData, setFormData] = useState<LayoutSettingsForm>(layoutSettingsTemplate);

  useEffect(() => {
    if (!loading) setFormData(pickLayoutSettings(config));
  }, [loading, config]);

  const previewLayout = useMemo(() => appLayout(formData, 'home'), [formData]);
  const preview = useAppLayout('home', previewLayout);
  const previewRef = useRef<HTMLDivElement>(null);

  // Its links and dots are only for show
  useEffect(() => {
    previewRef.current?.setAttribute('inert', '');
  }, []);

  const formSubmitHandler = async (e: FormEvent) => {
    e.preventDefault();

    await updateConfig(pickLayoutSettings(formData));
  };

  const inputChangeHandler = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    options?: { isNumber?: boolean; isBool?: boolean }
  ) => {
    inputHandler<LayoutSettingsForm>({
      e,
      options,
      setStateHandler: setFormData,
      state: formData,
    });
  };

  const boolHandler = (e: ChangeEvent<HTMLSelectElement>) =>
    inputChangeHandler(e, { isBool: true });

  const columnsSelect = (id: 'homeAppColumns' | 'appsPageColumns', label: string) => (
    <InputGroup>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        name={id}
        value={formData[id]}
        onChange={(e) => inputChangeHandler(e, { isNumber: true })}
      >
        <option value={0}>Automatic</option>
        {COLUMN_OPTIONS.map((count) => (
          <option key={count} value={count}>
            {count} {count === 1 ? 'column' : 'columns'}
          </option>
        ))}
      </select>
    </InputGroup>
  );

  return (
    <form onSubmit={(e) => formSubmitHandler(e)}>
      {/* === APPS === */}
      <SettingsHeadline text="Apps" />
      <InputGroup>
        <label htmlFor="appTileStyle">App style</label>
        <select
          id="appTileStyle"
          name="appTileStyle"
          value={formData.appTileStyle}
          onChange={(e) => inputChangeHandler(e)}
        >
          <option value="list">List rows</option>
          <option value="tiles">Icon tiles</option>
        </select>
        <span>Icon tiles show a big icon with the name underneath</span>
      </InputGroup>

      <InputGroup>
        <label htmlFor="appDensity">Density</label>
        <select
          id="appDensity"
          name="appDensity"
          value={formData.appDensity}
          onChange={(e) => inputChangeHandler(e)}
        >
          <option value="compact">Compact</option>
          <option value="normal">Normal</option>
          <option value="roomy">Roomy</option>
        </select>
      </InputGroup>

      <InputGroup>
        <label htmlFor="appIconScale">Icon size: {formData.appIconScale}%</label>
        <input
          type="range"
          id="appIconScale"
          name="appIconScale"
          className={classes.Slider}
          min={MIN_ICON_SCALE}
          max={MAX_ICON_SCALE}
          step={10}
          value={formData.appIconScale}
          onChange={(e) => inputChangeHandler(e, { isNumber: true })}
        />
      </InputGroup>

      {/* === COLUMNS === */}
      <SettingsHeadline text="Columns" />
      {columnsSelect('homeAppColumns', 'Home page')}
      {columnsSelect('appsPageColumns', 'Applications page')}
      <InputGroup>
        <span>
          A fixed number is the most columns shown. Phones and narrow windows
          still get fewer, like with automatic columns
        </span>
      </InputGroup>

      {/* === DETAILS === */}
      <SettingsHeadline text="Details" />
      <BoolSelect
        id="hideAppUrls"
        label="Hide app URLs"
        value={formData.hideAppUrls}
        onChange={boolHandler}
      />
      <BoolSelect
        id="hideAppDescriptions"
        label="Hide app descriptions"
        value={formData.hideAppDescriptions}
        onChange={boolHandler}
      />
      <BoolSelect
        id="hideStatusDots"
        label="Hide status dots"
        value={formData.hideStatusDots}
        onChange={boolHandler}
      />

      {/* === PREVIEW === */}
      <SettingsHeadline text="Preview" />
      <div
        ref={previewRef}
        className={classes.Preview}
        style={preview.style}
        data-testid="layout-preview"
      >
        <AppCard
          category={PREVIEW_CATEGORY}
          fromHomepage
          statuses={PREVIEW_STATUSES}
          layout={previewLayout}
        />
      </div>

      <Button>Save changes</Button>
    </form>
  );
};
