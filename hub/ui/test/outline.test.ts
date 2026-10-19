import { fireEvent, render, screen } from '@testing-library/svelte';
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

  it('says what deleting a question or section will do, before it is done', async () => {
    render(Outline, { form: matchForm(), selected: { si: 0, qi: null }, onselect: vi.fn(), onchange: vi.fn() });
    await fireEvent.click(screen.getByRole('button', { name: 'Delete Coral scored' }));
    expect(screen.getByRole('dialog').textContent).toContain('It will be removed from the draft.');
    await fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Delete section Auto' }));
    expect(screen.getByRole('dialog').textContent).toContain('Its 3 questions will be removed from the draft.');
  });
});
