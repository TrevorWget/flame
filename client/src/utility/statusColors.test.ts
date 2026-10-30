import { describe, expect, it } from 'vitest';

import { themes } from '../../../utils/init/themes.json';
import {
  CLASSIC_STATUS_COLORS,
  MIN_STATUS_CONTRAST,
  contrastRatio,
  parseHex,
  statusColors,
} from './statusColors';

describe('status colors', () => {
  it.each(themes.map((theme) => [theme.name, theme.colors] as const))(
    '%s: every status stands out from the background',
    (_, colors) => {
      const derived = statusColors(colors);

      for (const color of Object.values(derived)) {
        expect(contrastRatio(color, colors.background)).toBeGreaterThanOrEqual(
          MIN_STATUS_CONTRAST
        );
      }
    }
  );

  it('keeps theme colors that already contrast enough', () => {
    expect(
      statusColors({ background: '#242B33', primary: '#EFFBFF', accent: '#6EE2FF' })
    ).toEqual({ up: '#6ee2ff', unhealthy: '#afefff', down: '#effbff' });
  });

  it('moves a faint accent away from the background', () => {
    const { up } = statusColors({
      background: '#ffffff',
      primary: '#222222',
      accent: '#dddddd',
    });

    expect(up).not.toBe('#dddddd');
    expect(contrastRatio(up, '#ffffff')).toBeGreaterThanOrEqual(MIN_STATUS_CONTRAST);
    // Still a grey, only darker
    expect(new Set(up.slice(1).match(/../g)).size).toBe(1);
  });

  it('uses custom colors as they are and ignores invalid ones', () => {
    const colors = statusColors(
      { background: '#ffffff', primary: '#222222', accent: '#dddddd' },
      { statusColorUp: '#eeffee', statusColorUnhealthy: '', statusColorDown: 'red' }
    );

    expect(colors.up).toBe('#eeffee');
    expect(colors.unhealthy).not.toBe('');
    expect(colors.down).toBe('#222222');
  });

  it('parses short and alpha hex colors', () => {
    expect(parseHex('#fa0')).toEqual([255, 170, 0]);
    expect(parseHex('#ffaa0080')).toEqual([255, 170, 0]);
    expect(parseHex('orange')).toBeNull();
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21);
    expect(contrastRatio(CLASSIC_STATUS_COLORS.up, '#242b33')).toBeGreaterThan(
      MIN_STATUS_CONTRAST
    );
  });
});
