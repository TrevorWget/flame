import { fireEvent, render, screen, within } from '@testing-library/react';
import axios from 'axios';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Config, Theme } from '../../../../interfaces';
import { ActionType } from '../../../../store/action-types';
import { store } from '../../../../store/store';
import { configTemplate, themeSettingsTemplate } from '../../../../utility';
import { ThemeOptions } from './ThemeOptions';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

const themes: Theme[] = [
  {
    name: 'cloud',
    isCustom: false,
    colors: { background: '#f1f2f0', primary: '#35342f', accent: '#37bbe4' },
  },
  {
    name: 'tron',
    isCustom: false,
    colors: { background: '#242B33', primary: '#EFFBFF', accent: '#6EE2FF' },
  },
  {
    name: 'mine',
    isCustom: true,
    colors: { background: '#101010', primary: '#fafafa', accent: '#ff0066' },
  },
];

const loadConfig = (config: Partial<Config>) =>
  store.dispatch({
    type: ActionType.getAdminConfig,
    payload: {
      ...configTemplate,
      defaultTheme: '#EFFBFF;#6EE2FF;#242B33',
      ...config,
    },
  });

const renderOptions = () =>
  render(
    <Provider store={store}>
      <ThemeOptions />
    </Provider>
  );

beforeEach(() => {
  vi.resetAllMocks();
  store.dispatch({ type: ActionType.getConfig, payload: {} });
  store.dispatch({ type: ActionType.fetchThemes, payload: themes });
});

describe('theme options', () => {
  it('start out manual with the default font, showing no light or dark choices', () => {
    loadConfig({});
    renderOptions();

    expect(screen.getByLabelText('Light and dark themes')).toHaveValue(
      'manual'
    );
    expect(screen.queryByLabelText('Light theme')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Roboto/ })).toBeChecked();
  });

  it('pick a light and a dark theme, user themes included', () => {
    loadConfig({});
    renderOptions();

    fireEvent.change(screen.getByLabelText('Light and dark themes'), {
      target: { value: 'system' },
    });

    expect(screen.getByLabelText('Light theme')).toHaveValue(
      '#35342f;#37bbe4;#f1f2f0'
    );
    expect(screen.getByLabelText('Dark theme')).toHaveValue(
      '#EFFBFF;#6EE2FF;#242B33'
    );
    expect(
      within(screen.getByLabelText('Light theme')).getByRole('option', {
        name: '+ mine',
      })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Switch at')).not.toBeInTheDocument();
  });

  it('fall back to fixed times without a weather location', () => {
    loadConfig({ themeMode: 'time', lat: 0, long: 0 });
    renderOptions();

    expect(screen.getByText(/No weather location is set/)).toBeInTheDocument();
    expect(screen.getByLabelText('Light theme from')).toHaveValue('07:00');
    expect(screen.getByLabelText('Dark theme from')).toHaveValue('19:00');
  });

  it("show today's sun times when following the sun", () => {
    loadConfig({
      themeMode: 'time',
      lat: 51.5,
      long: -0.12,
      sunTimes: { sunrise: 6 * 60 + 30, sunset: 17 * 60, polar: null },
    });
    renderOptions();

    expect(
      screen.getByText(/^Today: light from .+, dark from .+\.$/)
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Light theme from')).not.toBeInTheDocument();
  });

  it('save only their own settings', async () => {
    mockedAxios.put.mockResolvedValue({
      data: { success: true, data: configTemplate },
    });
    loadConfig({ customTitle: 'Not mine' });
    renderOptions();

    fireEvent.change(screen.getByLabelText('Light and dark themes'), {
      target: { value: 'system' },
    });
    fireEvent.change(screen.getByLabelText('Dark theme'), {
      target: { value: '#fafafa;#ff0066;#101010' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /^Source Serif/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const [url, body] = mockedAxios.put.mock.calls[0];
    expect(url).toBe('/api/config');
    expect(Object.keys(body as object).sort()).toEqual(
      Object.keys(themeSettingsTemplate).sort()
    );
    expect(body).toMatchObject({
      themeMode: 'system',
      darkTheme: '#fafafa;#ff0066;#101010',
      fontFamily: 'source-serif',
    });
  });
});
