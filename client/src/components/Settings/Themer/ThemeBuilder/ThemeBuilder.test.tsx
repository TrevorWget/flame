import { fireEvent, render, screen, within } from '@testing-library/react';
import axios from 'axios';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Theme } from '../../../../interfaces';
import { ActionType } from '../../../../store/action-types';
import { store } from '../../../../store/store';
import { statusColors } from '../../../../utility';
import { ThemeBuilder } from './ThemeBuilder';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

const tron: Theme = {
  name: 'tron',
  isCustom: false,
  colors: { background: '#242B33', primary: '#EFFBFF', accent: '#6EE2FF' },
};
const mine: Theme = {
  name: 'mine',
  isCustom: true,
  colors: { background: '#101010', primary: '#fafafa', accent: '#ff0066' },
};

const renderBuilder = () =>
  render(
    <Provider store={store}>
      <ThemeBuilder themes={store.getState().theme.userThemes} />
    </Provider>
  );

const preview = () => screen.getByRole('figure', { name: 'Live preview' });

beforeEach(() => {
  vi.resetAllMocks();
  store.dispatch({ type: ActionType.fetchThemes, payload: [tron, mine] });
  store.dispatch({
    type: ActionType.login,
    payload: {
      expiresAt: null,
      method: 'password',
      user: null,
      logoutUrl: null,
    },
  } as never);
  store.dispatch({ type: ActionType.editTheme, payload: null });
});

describe('theme editor', () => {
  it('previews colors as they are picked, status dots included', () => {
    renderBuilder();
    fireEvent.click(screen.getByRole('button', { name: 'Create new theme' }));

    fireEvent.change(screen.getByLabelText('Background'), {
      target: { value: '#fdf6e3' },
    });
    fireEvent.change(screen.getByLabelText('Primary'), {
      target: { value: '#073642' },
    });
    fireEvent.change(screen.getByLabelText('Accent color picker'), {
      target: { value: '#b58900' },
    });

    expect(preview().style.getPropertyValue('--color-background')).toBe(
      '#fdf6e3'
    );
    expect(preview().style.getPropertyValue('--color-primary')).toBe('#073642');
    expect(preview().style.getPropertyValue('--color-accent')).toBe('#b58900');

    const expected = statusColors({
      background: '#fdf6e3',
      primary: '#073642',
      accent: '#b58900',
    });
    const dot = within(preview()).getAllByRole('img', { name: /^Up:/ })[0];
    expect(dot.style.getPropertyValue('--status-color')).toBe(expected.up);
  });

  it('warns about low contrast', () => {
    renderBuilder();
    fireEvent.click(screen.getByRole('button', { name: 'Create new theme' }));

    fireEvent.change(screen.getByLabelText('Background'), {
      target: { value: '#ffffff' },
    });
    fireEvent.change(screen.getByLabelText('Primary'), {
      target: { value: '#dddddd' },
    });
    fireEvent.change(screen.getByLabelText('Accent'), {
      target: { value: '#eeeeee' },
    });

    const warnings = screen.getAllByRole('status').map((el) => el.textContent);
    expect(warnings).toEqual([
      expect.stringMatching(
        /^Low contrast with the background \(1\.4:1\)\. Text is hard to read below 4\.5:1\.$/
      ),
      expect.stringMatching(
        /^Low contrast with the background \(1\.2:1\)\. Aim for at least 3:1\.$/
      ),
    ]);

    fireEvent.change(screen.getByLabelText('Primary'), {
      target: { value: '#222222' },
    });
    fireEvent.change(screen.getByLabelText('Accent'), {
      target: { value: '#0066cc' },
    });
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });

  it('starts a new theme from an existing one', () => {
    renderBuilder();
    fireEvent.click(screen.getByRole('button', { name: 'Create new theme' }));

    fireEvent.change(screen.getByLabelText('Start from'), {
      target: { value: 'tron' },
    });

    expect(screen.getByLabelText('Background')).toHaveValue('#242B33');
    expect(screen.getByLabelText('Accent')).toHaveValue('#6EE2FF');
  });

  it('duplicates a user theme under a free name', async () => {
    mockedAxios.post.mockResolvedValue({ data: { success: true, data: {} } });
    renderBuilder();

    fireEvent.click(screen.getByRole('button', { name: 'Edit user themes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate mine' }));

    expect(screen.getByLabelText('Theme name')).toHaveValue('mine copy');
    expect(screen.getByLabelText('Background')).toHaveValue('#101010');

    fireEvent.click(screen.getByRole('button', { name: 'Add theme' }));

    expect(mockedAxios.post).toHaveBeenCalledWith(
      '/api/themes',
      { ...mine, name: 'mine copy' },
      expect.anything()
    );
  });

  it('edits a theme and blocks names that are taken', () => {
    mockedAxios.put.mockResolvedValue({
      data: { success: true, data: [mine] },
    });
    mockedAxios.get.mockResolvedValue({ data: { success: true, data: {} } });
    renderBuilder();

    fireEvent.click(screen.getByRole('button', { name: 'Edit user themes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit mine' }));

    const name = screen.getByLabelText('Theme name');
    expect(name).toHaveValue('mine');

    fireEvent.change(name, { target: { value: 'tron' } });
    expect(
      screen.getByText('A theme with this name already exists')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update theme' }));
    expect(mockedAxios.put).not.toHaveBeenCalled();

    fireEvent.change(name, { target: { value: 'mine 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update theme' }));
    expect(mockedAxios.put).toHaveBeenCalledWith(
      '/api/themes/mine',
      { ...mine, name: 'mine 2' },
      expect.anything()
    );
  });
});
