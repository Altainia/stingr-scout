import { render, screen } from '@testing-library/svelte';
import { expect, it } from 'vitest';
import App from '../src/App.svelte';

it('renders the app shell', () => {
  render(App);
  expect(screen.getByRole('heading', { name: 'Stingr Scout' })).toBeTruthy();
});
