import {
  ChangeEvent,
  CSSProperties,
  FormEvent,
  Fragment,
  useEffect,
  useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { bindActionCreators } from 'redux';

import { Theme, ThemeSettingsForm } from '../../../../interfaces';
import { actionCreators } from '../../../../store';
import { State } from '../../../../store/reducers';
import {
  FONTS,
  inputHandler,
  parseThemeToPAB,
  themeSettingsTemplate,
} from '../../../../utility';
import { Button, InputGroup, SettingsHeadline } from '../../../UI';
import classes from './ThemeOptions.module.css';

const KEYS = Object.keys(themeSettingsTemplate) as (keyof ThemeSettingsForm)[];

const pick = (source: Partial<ThemeSettingsForm>): ThemeSettingsForm =>
  Object.fromEntries(
    KEYS.map((key) => [key, source[key] ?? themeSettingsTemplate[key]])
  ) as unknown as ThemeSettingsForm;

const hasLocation = (lat?: number | null, long?: number | null): boolean =>
  typeof lat === 'number' &&
  typeof long === 'number' &&
  !(lat === 0 && long === 0);

// Sun times are minutes after UTC midnight
const localTime = (utcMinutes: number): string => {
  const date = new Date();
  date.setUTCHours(0, utcMinutes, 0, 0);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

interface ThemeSelectProps {
  id: keyof ThemeSettingsForm;
  label: string;
  value: string;
  themes: Theme[];
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  hint?: string;
}

const ThemeSelect = ({
  id,
  label,
  value,
  themes,
  onChange,
  hint,
}: ThemeSelectProps) => {
  const known = themes.some((theme) => parseThemeToPAB(theme.colors) === value);

  return (
    <InputGroup>
      <label htmlFor={id}>{label}</label>
      <select id={id} name={id} value={value} onChange={onChange}>
        {/* Saved colors that no theme has any more, e.g. after a delete */}
        {!known && <option value={value}>Saved colors</option>}
        {themes.map((theme) => (
          <option key={theme.name} value={parseThemeToPAB(theme.colors)}>
            {theme.isCustom && '+'} {theme.name}
          </option>
        ))}
      </select>
      {hint && <span>{hint}</span>}
    </InputGroup>
  );
};

export const ThemeOptions = (): JSX.Element => {
  const { themes, userThemes } = useSelector((state: State) => state.theme);
  const { config, loading } = useSelector((state: State) => state.config);

  const { updateConfig } = bindActionCreators(actionCreators, useDispatch());

  const [formData, setFormData] = useState<ThemeSettingsForm>(
    themeSettingsTemplate
  );

  // Only when the saved values change (e.g. an edited theme moved them), not
  // whenever another part of the config arrives
  const saved = JSON.stringify(pick(config));

  useEffect(() => {
    if (!loading) setFormData(JSON.parse(saved));
  }, [saved, loading]);

  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    inputHandler<ThemeSettingsForm>({
      e,
      setStateHandler: setFormData,
      state: formData,
    });

  const submitHandler = async (e: FormEvent) => {
    e.preventDefault();
    await updateConfig(pick(formData));
  };

  const allThemes = [...themes, ...userThemes];
  const isAutomatic = formData.themeMode !== 'manual';
  const locationSet = hasLocation(config.lat, config.long);
  const useSun = formData.themeSchedule === 'sun' && locationSet;
  const sun = config.themeSchedule === 'sun' ? config.sunTimes : null;

  return (
    <form onSubmit={submitHandler} className={classes.ThemeOptions}>
      <SettingsHeadline text="Theme options" />

      <ThemeSelect
        id="defaultTheme"
        label="Default theme for new users"
        value={formData.defaultTheme}
        themes={allThemes}
        onChange={onChange}
      />

      <InputGroup>
        <label htmlFor="themeMode">Light and dark themes</label>
        <select
          id="themeMode"
          name="themeMode"
          value={formData.themeMode}
          onChange={onChange}
        >
          <option value="manual">Manual: use the theme picked above</option>
          <option value="system">
            Follow the device's light or dark setting
          </option>
          <option value="time">Switch by time of day</option>
        </select>
        {isAutomatic && (
          <span>
            The dashboard switches between the two themes below for everyone. A
            theme picked above applies until the next switch.
          </span>
        )}
      </InputGroup>

      {isAutomatic && (
        <div className={classes.Pair}>
          <ThemeSelect
            id="lightTheme"
            label="Light theme"
            value={formData.lightTheme}
            themes={allThemes}
            onChange={onChange}
          />
          <ThemeSelect
            id="darkTheme"
            label="Dark theme"
            value={formData.darkTheme}
            themes={allThemes}
            onChange={onChange}
          />
        </div>
      )}

      {formData.themeMode === 'time' && (
        <Fragment>
          <InputGroup>
            <label htmlFor="themeSchedule">Switch at</label>
            <select
              id="themeSchedule"
              name="themeSchedule"
              value={formData.themeSchedule}
              onChange={onChange}
            >
              <option value="sun">
                Sunrise and sunset at the weather location
              </option>
              <option value="fixed">Fixed times</option>
            </select>
            {formData.themeSchedule === 'sun' && !locationSet && (
              <span>
                No weather location is set, so the fixed times below are used.
                Set one in the Weather settings to follow the sun.
              </span>
            )}
            {useSun && sun && (
              <span>
                {sun.polar
                  ? `The sun doesn't ${
                      sun.polar === 'day' ? 'set' : 'rise'
                    } there today, so the ${
                      sun.polar === 'day' ? 'light' : 'dark'
                    } theme stays on.`
                  : `Today: light from ${localTime(
                      sun.sunrise!
                    )}, dark from ${localTime(sun.sunset!)}.`}
              </span>
            )}
          </InputGroup>

          {!useSun && (
            <div className={classes.Pair}>
              <InputGroup>
                <label htmlFor="themeLightTime">Light theme from</label>
                <input
                  type="time"
                  id="themeLightTime"
                  name="themeLightTime"
                  required
                  value={formData.themeLightTime}
                  onChange={onChange}
                />
              </InputGroup>
              <InputGroup>
                <label htmlFor="themeDarkTime">Dark theme from</label>
                <input
                  type="time"
                  id="themeDarkTime"
                  name="themeDarkTime"
                  required
                  value={formData.themeDarkTime}
                  onChange={onChange}
                />
              </InputGroup>
            </div>
          )}
        </Fragment>
      )}

      <fieldset className={classes.Fonts}>
        <legend>Font</legend>
        {FONTS.map((font) => (
          <label
            key={font.id}
            className={classes.Font}
            style={{ '--preview-font': font.stack } as CSSProperties}
          >
            <input
              type="radio"
              name="fontFamily"
              value={font.id}
              checked={formData.fontFamily === font.id}
              onChange={onChange}
            />
            <span className={classes.FontName}>{font.name}</span>
            <span className={classes.FontSample}>Good morning! 09:41</span>
            <span className={classes.FontDescription}>{font.description}</span>
          </label>
        ))}
      </fieldset>

      <Button>Save changes</Button>
    </form>
  );
};
