import { act, fireEvent, render, screen, within } from '@testing-library/react';
import axios from 'axios';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Config } from '../../../interfaces';
import { ActionType } from '../../../store/action-types';
import { store } from '../../../store/store';
import { configTemplate, layoutSettingsTemplate } from '../../../utility';
import { LayoutSettings } from './LayoutSettings';

vi.mock('axios');

const put = vi.mocked(axios.put);

const setConfig = (changes: Partial<Config> = {}) =>
  act(() => {
    store.dispatch({
      type: ActionType.getConfig,
      payload: { ...configTemplate, ...changes },
    });
  });

const renderSettings = () =>
  render(
    <Provider store={store}>
      <LayoutSettings />
    </Provider>
  );

const preview = () => screen.getByTestId('layout-preview');
const previewCard = () => preview().firstElementChild as HTMLElement;
const change = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('layout settings', () => {
  beforeEach(() => {
    put.mockReset();
    put.mockImplementation(async (_url, data) => ({
      data: { success: true, data: { ...store.getState().config.config, ...(data as object) } },
    }));
  });

  afterEach(() => {
    setConfig();
  });

  it('starts from the saved settings', () => {
    setConfig({ appTileStyle: 'tiles', homeAppColumns: 4, hideStatusDots: true });
    renderSettings();

    expect(screen.getByLabelText('App style')).toHaveValue('tiles');
    expect(screen.getByLabelText('Home page')).toHaveValue('4');
    expect(screen.getByLabelText('Applications page')).toHaveValue('0');
    expect(screen.getByLabelText('Hide status dots')).toHaveValue('1');
    expect(previewCard().className).toMatch(/TileAppCard/);
  });

  it('previews unsaved changes', () => {
    setConfig();
    renderSettings();

    expect(previewCard().className).not.toMatch(/TileAppCard/);
    expect(within(preview()).getByText('sonarr.lan')).toBeInTheDocument();
    expect(within(preview()).getAllByRole('img', { name: /Preview/ })).toHaveLength(4);

    change('App style', 'tiles');
    change(/^Icon size/, '150');
    change('Hide app URLs', '1');
    change('Hide status dots', '1');

    expect(previewCard().className).toMatch(/TileAppCard/);
    expect(screen.getByLabelText(/^Icon size/)).toHaveAccessibleName('Icon size: 150%');
    expect(preview().style.getPropertyValue('--app-icon-size')).toBe('84px');
    expect(within(preview()).queryByText('sonarr.lan')).not.toBeInTheDocument();
    expect(within(preview()).getByText('Movies and shows')).toBeInTheDocument();
    expect(within(preview()).queryByRole('img', { name: /Preview/ })).not.toBeInTheDocument();
    // Nothing is saved until the form is submitted
    expect(store.getState().config.config.appTileStyle).toBe('list');
  });

  it('saves only the layout settings', async () => {
    setConfig();
    renderSettings();

    change('Density', 'compact');
    change('Home page', '6');
    change('Applications page', '3');
    change('Hide app descriptions', '1');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });

    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0]).toBe('/api/config');
    expect(put.mock.calls[0][1]).toEqual({
      ...layoutSettingsTemplate,
      appDensity: 'compact',
      homeAppColumns: 6,
      appsPageColumns: 3,
      hideAppDescriptions: true,
    });
    expect(store.getState().config.config.homeAppColumns).toBe(6);
  });
});
