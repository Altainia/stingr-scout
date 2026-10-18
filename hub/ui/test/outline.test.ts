import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { matchForm } from '../../../shared/test/fixtures';
import Outline from '../src/components/Outline.svelte';

describe('Outline', () => {
  it('marks required questions with a "Required" tag, not an asterisk', () => {
    render(Outline, { form: matchForm(), selected: { si: 0, qi: null }, onselect: vi.fn(), onchange: vi.fn() });
    const coral = screen.getByRole('button', { name: /^Coral scored · Counter/ }); // required
    expect(coral.textContent).not.toContain('*');
    expect(coral.querySelector('.tag')?.textContent).toBe('Required');
    const start = screen.getByRole('button', { name: /^Start position · Field map/ }); // optional
    expect(start.querySelector('.tag')).toBeNull();
  });
});
