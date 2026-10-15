import { render, screen } from '@testing-library/svelte';
import { expect, it } from 'vitest';
import App from '../src/App.svelte';

it('renders the hub shell', () => {
  render(App);
  expect(screen.getByText('Stingr Scout Hub')).toBeTruthy();
});
