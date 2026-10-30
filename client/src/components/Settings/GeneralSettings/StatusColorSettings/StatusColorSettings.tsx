import { ChangeEvent, Dispatch, Fragment, SetStateAction } from 'react';
import { useSelector } from 'react-redux';

import { AppStatusName, GeneralForm } from '../../../../interfaces';
import { State } from '../../../../store/reducers';
import {
  CLASSIC_STATUS_COLORS,
  MIN_STATUS_CONTRAST,
  contrastRatio,
  statusColors,
} from '../../../../utility';
import { StatusDot } from '../../../Apps/AppStatus/StatusDot';
import { InputGroup } from '../../../UI';
import classes from './StatusColorSettings.module.css';

type ColorKey = 'statusColorUp' | 'statusColorUnhealthy' | 'statusColorDown';

const FIELDS: { key: ColorKey; status: AppStatusName; label: string }[] = [
  { key: 'statusColorUp', status: 'up', label: 'Up' },
  { key: 'statusColorUnhealthy', status: 'unhealthy', label: 'Unhealthy' },
  { key: 'statusColorDown', status: 'down', label: 'Down' },
];

const PREVIEW_SINCE = new Date().toISOString();

interface Props {
  formData: GeneralForm;
  setFormData: Dispatch<SetStateAction<GeneralForm>>;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
}

export const StatusColorSettings = ({
  formData,
  setFormData,
  onChange,
}: Props): JSX.Element => {
  const theme = useSelector((state: State) => state.theme.activeTheme.colors);
  const isCustom = FIELDS.some(({ key }) => formData[key]);
  const colors = statusColors(theme, formData);

  const modeChangeHandler = (e: ChangeEvent<HTMLSelectElement>) => {
    const custom = e.target.value === 'custom';

    setFormData((prev) => ({
      ...prev,
      ...Object.fromEntries(
        FIELDS.map(({ key, status }) => [
          key,
          custom ? prev[key] || CLASSIC_STATUS_COLORS[status] : '',
        ])
      ),
    }));
  };

  return (
    <Fragment>
      <InputGroup>
        <label htmlFor="statusColors">Status colors</label>
        <select
          id="statusColors"
          value={isCustom ? 'custom' : 'theme'}
          onChange={modeChangeHandler}
        >
          <option value="theme">From the theme</option>
          <option value="custom">Custom</option>
        </select>
        <span>
          Theme colors use the accent color for up, the primary color for down
          and a mix of both for unhealthy, adjusted where needed to reach a{' '}
          {MIN_STATUS_CONTRAST}:1 contrast with the background
        </span>
      </InputGroup>

      {isCustom && (
        <div className={classes.Colors}>
          {FIELDS.map(({ key, label }) => {
            const contrast = contrastRatio(formData[key], theme.background);

            return (
              <InputGroup key={key}>
                <label htmlFor={key}>{label}</label>
                <input
                  type="color"
                  id={key}
                  name={key}
                  value={formData[key]}
                  onChange={onChange}
                />
                {contrast !== null && contrast < MIN_STATUS_CONTRAST && (
                  <span>
                    Low contrast with this theme ({contrast.toFixed(1)}:1)
                  </span>
                )}
              </InputGroup>
            );
          })}
        </div>
      )}

      <div className={classes.Preview}>
        {FIELDS.map(({ status, label }) => (
          <div key={status}>
            {label}
            <StatusDot
              status={{ status, detail: 'Preview', since: PREVIEW_SINCE }}
              colors={colors}
            />
          </div>
        ))}
      </div>
    </Fragment>
  );
};
