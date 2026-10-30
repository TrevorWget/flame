import { FontId } from '../interfaces';

export interface FontOption {
  id: FontId;
  name: string;
  description: string;
  stack: string;
}

// Each font is bundled in src/fonts.css; the server keeps the same ids
// (validation/config.js)
export const FONTS: FontOption[] = [
  {
    id: 'roboto',
    name: 'Roboto',
    description: 'Default',
    stack: 'Roboto, sans-serif',
  },
  {
    id: 'inter',
    name: 'Inter',
    description: 'Neutral sans serif',
    stack: "'Inter Variable', Roboto, sans-serif",
  },
  {
    id: 'nunito',
    name: 'Nunito',
    description: 'Rounded sans serif',
    stack: "'Nunito Variable', Roboto, sans-serif",
  },
  {
    id: 'source-serif',
    name: 'Source Serif',
    description: 'Serif',
    stack: "'Source Serif 4 Variable', Georgia, serif",
  },
  {
    id: 'jetbrains-mono',
    name: 'JetBrains Mono',
    description: 'Monospace',
    stack: "'JetBrains Mono Variable', ui-monospace, monospace",
  },
  {
    id: 'system',
    name: 'System',
    description: "Your device's interface font, nothing to download",
    stack:
      "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
];

export const DEFAULT_FONT: FontId = 'roboto';

export const getFont = (id: string | undefined): FontOption =>
  FONTS.find((font) => font.id === id) || FONTS[0];

/**
 * Sets the dashboard font. The default keeps form fields on the browser's own
 * font, as before fonts could be picked; any other font is used for them too.
 */
export const applyFont = (id: string | undefined): void => {
  const font = getFont(id);
  const { body } = document;

  body.style.setProperty('--font-family', font.stack);

  if (font.id === DEFAULT_FONT) {
    delete body.dataset.font;
  } else {
    body.dataset.font = font.id;
  }
};
