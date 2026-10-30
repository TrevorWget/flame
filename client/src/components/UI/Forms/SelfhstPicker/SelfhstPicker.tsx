import axios, { AxiosError } from 'axios';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { bindActionCreators } from 'redux';

import { ApiResponse } from '../../../../interfaces';
import { actionCreators } from '../../../../store';
import { applyAuth } from '../../../../utility';
import classes from './SelfhstPicker.module.css';

export interface SelfhstIcon {
  name: string;
  reference: string;
  svg: boolean;
  png: boolean;
  webp: boolean;
  light: boolean;
  dark: boolean;
  category: string;
}

interface SearchResult {
  icons: SelfhstIcon[];
  total: number;
  updatedAt: string | null;
  stale: boolean;
}

type Format = 'svg' | 'png' | 'webp';
type FileVariant = 'standard' | 'light' | 'dark';
// 'auto' stores the light and dark versions too and switches with the theme
type Variant = FileVariant | 'auto';

export interface PickedIcon {
  icon: string;
  // Missing versions are null, so the standard icon is shown instead
  iconOnDark: string | null;
  iconOnLight: string | null;
}

interface Props {
  // App or bookmark name, used to search and to suggest an icon
  name: string;
  // Current value of the icon field
  icon: string;
  // Whether the current icon has light/dark versions that follow the theme
  followsTheme?: boolean;
  onPicked: (picked: PickedIcon) => void;
}

const SEARCH_DELAY_MS = 250;
const SUGGEST_DELAY_MS = 400;
const RESULTS = 48;

const FORMATS: { value: Format; label: string }[] = [
  { value: 'svg', label: 'SVG (scalable)' },
  { value: 'webp', label: 'WebP' },
  { value: 'png', label: 'PNG' },
];

const VARIANTS: { value: Variant; label: string }[] = [
  { value: 'auto', label: 'Automatic (light on dark themes, dark on light themes)' },
  { value: 'standard', label: 'Standard colours' },
  { value: 'light', label: 'Light (for dark themes)' },
  { value: 'dark', label: 'Dark (for light themes)' },
];

export const previewUrl = (reference: string, variant: FileVariant = 'standard') =>
  `/api/icons/selfhst/preview/${reference}${
    variant === 'standard' ? '' : `?variant=${variant}`
  }`;

export const defaultFormat = (icon: SelfhstIcon): Format =>
  icon.svg ? 'svg' : icon.webp ? 'webp' : 'png';

const hasVariant = (icon: SelfhstIcon, variant: Variant) =>
  variant === 'standard' ||
  (variant === 'auto' ? icon.light || icon.dark : icon[variant]);

export const defaultVariant = (icon: SelfhstIcon): Variant =>
  hasVariant(icon, 'auto') ? 'auto' : 'standard';

// File names the server stores picked icons under
const STORED_ICON = /^selfhst-([a-z0-9][a-z0-9-]*?)(?:_(light|dark))?\.(svg|png|webp)$/;

/** The selfh.st icon a stored file name belongs to, e.g. selfhst-jellyfin_light.svg */
export const parseStoredIcon = (
  icon: string
): { reference: string; variant: FileVariant; format: Format } | null => {
  const match = STORED_ICON.exec(icon.trim());
  if (!match) return null;

  const [, reference, variant = 'standard', format] = match;
  return { reference, variant: variant as FileVariant, format: format as Format };
};

const errorMessage = (err: unknown, fallback: string) => {
  const error = err as AxiosError<{ error: string }>;

  if (error.response?.status === 503) {
    return "The selfh.st icon list can't be downloaded right now. Check that the Flame server can reach the internet";
  }

  return error.response?.data?.error || fallback;
};

/**
 * Searches the selfh.st icon collection (through the Flame server, which
 * caches the list) and stores the picked icon in Flame's local icon cache.
 * Also suggests the icon named like the app while the icon field is empty.
 */
export const SelfhstPicker = ({
  name,
  icon,
  followsTheme = false,
  onPicked,
}: Props): JSX.Element => {
  const dispatch = useDispatch();
  const { createNotification } = bindActionCreators(actionCreators, dispatch);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<SelfhstIcon | null>(null);
  const [variant, setVariant] = useState<Variant>('standard');
  const [format, setFormat] = useState<Format>('svg');
  const [storing, setStoring] = useState(false);
  const [suggestion, setSuggestion] = useState<SelfhstIcon | null>(null);
  const [upgrade, setUpgrade] = useState<SelfhstIcon | null>(null);
  const searchId = useRef(0);

  const iconEmpty = !icon.trim();
  const trimmedName = name.trim();
  const stored = parseStoredIcon(icon);
  const storedReference = stored?.reference;

  // Icons picked before Automatic existed (or as one version) can switch to it
  useEffect(() => {
    setUpgrade(null);
    if (!storedReference || followsTheme) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await axios.get<ApiResponse<SelfhstIcon | null>>(
          '/api/icons/selfhst/suggest',
          { params: { name: storedReference }, headers: applyAuth() }
        );
        const match = res.data.data;

        if (!cancelled && match?.reference === storedReference && hasVariant(match, 'auto')) {
          setUpgrade(match);
        }
      } catch {
        // Only a hint
      }
    }, SUGGEST_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [storedReference, followsTheme]);

  useEffect(() => {
    setSuggestion(null);
    if (open || !iconEmpty || trimmedName.length < 2) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await axios.get<ApiResponse<SelfhstIcon | null>>(
          '/api/icons/selfhst/suggest',
          { params: { name: trimmedName }, headers: applyAuth() }
        );
        if (!cancelled) setSuggestion(res.data.data);
      } catch {
        // Only a hint; the picker reports errors
      }
    }, SUGGEST_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, iconEmpty, trimmedName]);

  useEffect(() => {
    if (!open) return;

    const id = ++searchId.current;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await axios.get<ApiResponse<SearchResult>>(
          '/api/icons/selfhst/search',
          { params: { q: query.trim(), limit: RESULTS }, headers: applyAuth() }
        );
        if (id !== searchId.current) return;
        setResult(res.data.data);
        setError('');
      } catch (err) {
        if (id !== searchId.current) return;
        setResult(null);
        setError(errorMessage(err, 'Could not search the selfh.st icons'));
      } finally {
        if (id === searchId.current) setLoading(false);
      }
    }, SEARCH_DELAY_MS);

    return () => clearTimeout(timer);
  }, [open, query]);

  const toggle = () => {
    if (!open) {
      setQuery(trimmedName);
      setSelected(null);
    }
    setOpen(!open);
  };

  const select = (choice: SelfhstIcon) => {
    setSelected(choice);
    setVariant(defaultVariant(choice));
    setFormat(defaultFormat(choice));
  };

  const store = async (choice: SelfhstIcon, choiceFormat: Format, choiceVariant: Variant) => {
    setStoring(true);

    try {
      const res = await axios.post<ApiResponse<PickedIcon>>(
        '/api/icons/selfhst',
        { reference: choice.reference, format: choiceFormat, variant: choiceVariant },
        { headers: applyAuth() }
      );
      const { icon, iconOnDark = null, iconOnLight = null } = res.data.data;

      onPicked({ icon, iconOnDark, iconOnLight });
      setOpen(false);
      setSelected(null);
    } catch (err) {
      createNotification({
        title: 'Error',
        message: errorMessage(err, 'Could not store the selfh.st icon'),
      });
    } finally {
      setStoring(false);
    }
  };

  const keepFormOpen = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.preventDefault();
  };

  return (
    <div className={classes.SelfhstPicker}>
      {suggestion && iconEmpty && !open && (
        <div className={classes.Suggestion}>
          <img src={previewUrl(suggestion.reference)} alt="" />
          <p>selfh.st has an icon for {suggestion.name}.</p>
          <button
            type="button"
            className={classes.Link}
            disabled={storing}
            onClick={() => store(suggestion, defaultFormat(suggestion), defaultVariant(suggestion))}
          >
            {storing ? 'Storing icon...' : 'Use it'}
          </button>
        </div>
      )}

      {stored && followsTheme && !open && (
        <p className={classes.Note}>
          This icon follows the theme: light version on dark themes, dark version on light
          themes.
        </p>
      )}

      {upgrade && stored && !followsTheme && !open && (
        <div className={classes.Suggestion}>
          <p>{upgrade.name} has light and dark versions on selfh.st.</p>
          <button
            type="button"
            className={classes.Link}
            disabled={storing}
            onClick={() =>
              store(upgrade, upgrade[stored.format] ? stored.format : defaultFormat(upgrade), 'auto')
            }
          >
            {storing ? 'Storing icons...' : 'Switch to Automatic'}
          </button>
        </div>
      )}

      <button
        type="button"
        className={classes.Link}
        aria-expanded={open}
        onClick={toggle}
      >
        {open ? 'Close selfh.st icons' : 'Browse selfh.st icons'}
      </button>

      {open && (
        <div className={classes.Panel} role="group" aria-label="selfh.st icons">
          <input
            type="search"
            aria-label="Search selfh.st icons"
            placeholder="Search selfh.st icons, e.g. jellyfin"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={keepFormOpen}
            autoFocus
          />

          <p className={classes.Status} role="status">
            {error
              ? error
              : loading && !result
              ? 'Loading icons...'
              : result && !result.icons.length
              ? 'No icons match your search'
              : result && result.total > result.icons.length
              ? `Showing ${result.icons.length} of ${result.total.toLocaleString()} icons`
              : ''}
            {!error && result?.stale && result.updatedAt && (
              <> (saved icon list from {new Date(result.updatedAt).toLocaleDateString()})</>
            )}
          </p>

          {result && result.icons.length > 0 && (
            <ul className={classes.Grid}>
              {result.icons.map((choice) => (
                <li key={choice.reference}>
                  <button
                    type="button"
                    className={classes.Tile}
                    aria-pressed={selected?.reference === choice.reference}
                    title={choice.name}
                    onClick={() => select(choice)}
                  >
                    <img src={previewUrl(choice.reference)} alt="" loading="lazy" />
                    <div className={classes.TileName}>{choice.name}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selected && (
            <div className={classes.Options}>
              {variant === 'auto' ? (
                <div className={classes.Previews}>
                  <img
                    src={previewUrl(selected.reference, selected.light ? 'light' : 'standard')}
                    alt={`${selected.name} icon on dark themes`}
                    className={`${classes.LargePreview} ${classes.light}`}
                  />
                  <img
                    src={previewUrl(selected.reference, selected.dark ? 'dark' : 'standard')}
                    alt={`${selected.name} icon on light themes`}
                    className={`${classes.LargePreview} ${classes.dark}`}
                  />
                </div>
              ) : (
                <img
                  src={previewUrl(selected.reference, variant)}
                  alt={`${selected.name} icon preview`}
                  className={`${classes.LargePreview} ${classes[variant]}`}
                />
              )}
              <div className={classes.Choices}>
                <strong>{selected.name}</strong>
                <select
                  aria-label="Icon colours"
                  value={variant}
                  onChange={(e) => setVariant(e.target.value as Variant)}
                >
                  {VARIANTS.filter(({ value }) => hasVariant(selected, value)).map(
                    ({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    )
                  )}
                </select>
                <select
                  aria-label="Icon format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as Format)}
                >
                  {FORMATS.filter(({ value }) => selected[value]).map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={classes.UseButton}
                  disabled={storing}
                  onClick={() => store(selected, format, variant)}
                >
                  {storing ? 'Storing icon...' : 'Use this icon'}
                </button>
              </div>
            </div>
          )}

          <p className={classes.Credit}>
            Icons from{' '}
            <a href="https://selfh.st/icons" target="_blank" rel="noreferrer">
              selfh.st/icons
            </a>
            , licensed under{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noreferrer"
            >
              CC BY 4.0
            </a>
            . Flame keeps a local copy of the icons you pick. Logos are
            trademarks of their owners.
          </p>
        </div>
      )}
    </div>
  );
};
