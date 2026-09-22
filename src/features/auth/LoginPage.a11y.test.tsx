import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';

/**
 * The show-password toggle measured 26px (an 18px icon in `p-1`), under the
 * 44px minimum this app holds itself to. The icon must NOT grow — only the
 * hit area — which is what `.tap-44` does.
 *
 * jsdom has no layout engine and vitest stubs CSS imports, so this asserts the
 * class that carries the guarantee (same approach as the composer's `h-11`
 * checks) plus the two things that must NOT change: the icon size and the
 * toggle behaviour. `.tap-44` itself lives in `src/index.css`.
 */

afterEach(cleanup);

function renderLogin() {
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('login — show password toggle', () => {
  it('meets the 44px minimum tap target', () => {
    renderLogin();
    const toggle = screen.getByRole('button', { name: /show password/i });
    expect(toggle.className).toContain('tap-44');
  });

  it('keeps the eye icon at its original 18px', () => {
    renderLogin();
    const icon = screen
      .getByRole('button', { name: /show password/i })
      .querySelector('svg');
    expect(icon?.getAttribute('width')).toBe('18');
  });

  it('still toggles the password field', () => {
    renderLogin();
    const field = screen.getByPlaceholderText('Password');
    expect(field.getAttribute('type')).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(field.getAttribute('type')).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: /hide password/i }));
    expect(field.getAttribute('type')).toBe('password');
  });
});