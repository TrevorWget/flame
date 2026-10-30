import {
  BackupSettingsForm,
  DockerSettingsForm,
  UISettingsForm,
  GeneralForm,
  LayoutSettingsForm,
  ThemeSettingsForm,
  WeatherForm,
} from '../interfaces';

export type ConfigFormData =
  | WeatherForm
  | GeneralForm
  | DockerSettingsForm
  | UISettingsForm
  | LayoutSettingsForm
  | ThemeSettingsForm
  | BackupSettingsForm;
