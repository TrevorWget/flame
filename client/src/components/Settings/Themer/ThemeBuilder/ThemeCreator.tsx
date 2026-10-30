import { ChangeEvent, FormEvent, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { bindActionCreators } from 'redux';

import { Theme, ThemeColors } from '../../../../interfaces';
import { actionCreators } from '../../../../store';
import { State } from '../../../../store/reducers';
import { contrastRatio, parseHex } from '../../../../utility';
import { Button, InputGroup, ModalForm } from '../../../UI';
import classes from './ThemeCreator.module.css';
import { ThemeLivePreview } from './ThemeLivePreview';

// WCAG 2.1 AA: normal text, and large text or graphics
export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_ACCENT_CONTRAST = 3;

const FIELDS: { key: keyof ThemeColors; label: string; hint: string }[] = [
  { key: 'background', label: 'Background', hint: 'Page and form text' },
  { key: 'primary', label: 'Primary', hint: 'Text, icons and form fields' },
  {
    key: 'accent',
    label: 'Accent',
    hint: 'Category names, links and the search bar',
  },
];

const toColorInput = (color: string): string => {
  const rgb = parseHex(color);
  return rgb
    ? `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`
    : '#000000';
};

export const contrastWarnings = (
  colors: ThemeColors
): Partial<Record<keyof ThemeColors, string>> => {
  const warnings: Partial<Record<keyof ThemeColors, string>> = {};
  const text = contrastRatio(colors.primary, colors.background);
  const accent = contrastRatio(colors.accent, colors.background);

  if (text !== null && text < MIN_TEXT_CONTRAST) {
    warnings.primary = `Low contrast with the background (${text.toFixed(
      1
    )}:1). Text is hard to read below ${MIN_TEXT_CONTRAST}:1.`;
  }

  if (accent !== null && accent < MIN_ACCENT_CONTRAST) {
    warnings.accent = `Low contrast with the background (${accent.toFixed(
      1
    )}:1). Aim for at least ${MIN_ACCENT_CONTRAST}:1.`;
  }

  return warnings;
};

interface Props {
  modalHandler: () => void;
  // Colors and name to start a new theme from, e.g. when duplicating
  source?: Theme | null;
}

export const ThemeCreator = ({ modalHandler, source }: Props): JSX.Element => {
  const { activeTheme, themeInEdit, themes, userThemes } = useSelector(
    (state: State) => state.theme
  );

  const { addTheme, updateTheme, editTheme } = bindActionCreators(
    actionCreators,
    useDispatch()
  );

  // Mounted each time the modal opens, with the theme to edit or copy already set
  const [formData, setFormData] = useState<Theme>(() => {
    if (themeInEdit) return themeInEdit;
    if (source) return { ...source, isCustom: true };
    return { name: '', isCustom: true, colors: activeTheme.colors };
  });

  const allThemes = [...themes, ...userThemes];
  const nameTaken = allThemes.some(
    (t) => t.name === formData.name && t.name !== themeInEdit?.name
  );
  const warnings = contrastWarnings(formData.colors);

  const inputChangeHandler = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, name: e.target.value });
  };

  const setColor = (key: keyof ThemeColors, value: string) => {
    setFormData({ ...formData, colors: { ...formData.colors, [key]: value } });
  };

  const startFrom = (e: ChangeEvent<HTMLSelectElement>) => {
    const theme = allThemes.find((t) => t.name === e.target.value);
    if (theme) setFormData({ ...formData, colors: { ...theme.colors } });
  };

  const closeModal = () => {
    editTheme(null);
    modalHandler();
  };

  const formHandler = (e: FormEvent) => {
    e.preventDefault();

    if (nameTaken) return;

    if (!themeInEdit) {
      addTheme(formData);
    } else {
      updateTheme(formData, themeInEdit.name);
    }

    closeModal();
  };

  return (
    <ModalForm formHandler={formHandler} modalHandler={closeModal} wide>
      <div className={classes.Editor}>
        <div className={classes.Fields}>
          <InputGroup>
            <label htmlFor="name">Theme name</label>
            <input
              type="text"
              name="name"
              id="name"
              placeholder="my_theme"
              required
              maxLength={100}
              pattern={'[^\\/\\\\?#%]+'}
              title="Must not contain / \ ? # or %"
              value={formData.name}
              onChange={inputChangeHandler}
            />
            {nameTaken && (
              <span className={classes.Warning}>
                A theme with this name already exists
              </span>
            )}
          </InputGroup>

          {!themeInEdit && (
            <InputGroup>
              <label htmlFor="startFrom">Start from</label>
              <select id="startFrom" value="" onChange={startFrom}>
                <option value="" disabled>
                  Copy the colors of a theme
                </option>
                {allThemes.map((theme) => (
                  <option key={theme.name} value={theme.name}>
                    {theme.isCustom && '+'} {theme.name}
                  </option>
                ))}
              </select>
            </InputGroup>
          )}

          {FIELDS.map(({ key, label, hint }) => (
            <InputGroup key={key}>
              <label htmlFor={`${key}-hex`}>{label}</label>
              <span>{hint}</span>
              <div className={classes.Color}>
                <input
                  type="color"
                  aria-label={`${label} color picker`}
                  value={toColorInput(formData.colors[key])}
                  onChange={(e) => setColor(key, e.target.value)}
                />
                <input
                  type="text"
                  id={`${key}-hex`}
                  required
                  pattern="#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})"
                  title="A hex color, e.g. #1a1a1a"
                  spellCheck={false}
                  value={formData.colors[key]}
                  onChange={(e) => setColor(key, e.target.value.trim())}
                />
              </div>
              {warnings[key] && (
                <span className={classes.Warning} role="status">
                  {warnings[key]}
                </span>
              )}
            </InputGroup>
          ))}

          <Button>{themeInEdit ? 'Update theme' : 'Add theme'}</Button>
        </div>

        <ThemeLivePreview colors={formData.colors} />
      </div>
    </ModalForm>
  );
};
