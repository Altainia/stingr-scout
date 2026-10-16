import { applyTheme, loadTheme } from '@stingr/shared';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('themes', () => {
  it('defaults to the Stingr theme', () => {
    expect(loadTheme()).toBe('stingr');
  });
  it('applies a theme and remembers it on this device', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(loadTheme()).toBe('dark');
  });
  it('ignores an unknown saved theme', () => {
    localStorage.setItem('stingr-theme', 'neon');
    expect(loadTheme()).toBe('stingr');
  });
});
