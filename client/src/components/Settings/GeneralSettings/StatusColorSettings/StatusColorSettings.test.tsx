import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import { GeneralForm } from '../../../../interfaces';
import { store } from '../../../../store/store';
import { CLASSIC_STATUS_COLORS, generalSettingsTemplate, inputHandler } from '../../../../utility';
import { StatusColorSettings } from './StatusColorSettings';

let latest: GeneralForm;

const Harness = () => {
  const [formData, setFormData] = useState<GeneralForm>(generalSettingsTemplate);
  latest = formData;

  return (
    <StatusColorSettings
      formData={formData}
      setFormData={setFormData}
      onChange={(e) =>
        inputHandler<GeneralForm>({ e, setStateHandler: setFormData, state: formData })
      }
    />
  );
};

const renderSettings = () =>
  render(
    <Provider store={store}>
      <Harness />
    </Provider>
  );

describe('status color settings', () => {
  it('previews all three states with their labels', () => {
    renderSettings();

    for (const name of [/^Up: Preview/, /^Unhealthy: Preview/, /^Down: Preview/]) {
      expect(screen.getByRole('img', { name })).toBeInTheDocument();
    }
    expect(screen.queryByLabelText('Up')).not.toBeInTheDocument();
  });

  it('starts custom colors from the classic ones and clears them for the theme', () => {
    renderSettings();
    const mode = screen.getByLabelText('Status colors');

    fireEvent.change(mode, { target: { value: 'custom' } });
    expect(latest.statusColorUp).toBe(CLASSIC_STATUS_COLORS.up);
    expect(latest.statusColorUnhealthy).toBe(CLASSIC_STATUS_COLORS.unhealthy);
    expect(latest.statusColorDown).toBe(CLASSIC_STATUS_COLORS.down);

    fireEvent.change(screen.getByLabelText('Down'), { target: { value: '#ff0000' } });
    expect(latest.statusColorDown).toBe('#ff0000');

    fireEvent.change(mode, { target: { value: 'theme' } });
    expect(latest.statusColorUp).toBe('');
    expect(latest.statusColorDown).toBe('');
  });

  it('warns about colors that barely stand out from the theme background', () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText('Status colors'), {
      target: { value: 'custom' },
    });

    const background = store.getState().theme.activeTheme.colors.background;
    fireEvent.change(screen.getByLabelText('Up'), { target: { value: background } });

    expect(screen.getByText(/^Low contrast with this theme \(1\.0:1\)$/)).toBeInTheDocument();
  });
});
