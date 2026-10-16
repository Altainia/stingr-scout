import { describe, expect, it } from 'vitest';
import { defaultDataDir } from '../src/paths';

describe('defaultDataDir', () => {
  it('uses STINGR_DATA_DIR when set', () => {
    expect(defaultDataDir({ STINGR_DATA_DIR: '/data/x', XDG_DATA_HOME: '/xdg' }, '/home/a')).toBe('/data/x');
  });
  it('follows XDG_DATA_HOME, like the installer', () => {
    expect(defaultDataDir({ XDG_DATA_HOME: '/xdg' }, '/home/a')).toBe('/xdg/stingr-scout/data');
  });
  it('defaults to ~/.local/share', () => {
    expect(defaultDataDir({}, '/home/a')).toBe('/home/a/.local/share/stingr-scout/data');
  });
});
