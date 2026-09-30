// @vitest-environment jsdom
import { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { useDialogFocus } from '../../src/ui/onboarding/views/use-dialog-focus';

afterEach(cleanup);

function NestedDialogs() {
  const [outerOpen, setOuterOpen] = useState(false);
  const [innerOpen, setInnerOpen] = useState(false);
  const outerRef = useRef<HTMLDivElement>(null);
  const outerCloseRef = useRef<HTMLButtonElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const innerCloseRef = useRef<HTMLButtonElement>(null);
  useDialogFocus({ open: outerOpen, onClose: () => setOuterOpen(false), containerRef: outerRef, initialFocusRef: outerCloseRef });
  useDialogFocus({ open: innerOpen, onClose: () => setInnerOpen(false), containerRef: innerRef, initialFocusRef: innerCloseRef });
  return <main>
    <button type="button" onClick={() => setOuterOpen(true)}>Open drawer</button>
    <p>Background</p>
    {outerOpen && <div ref={outerRef} role="dialog" aria-label="Drawer">
      <button ref={outerCloseRef} type="button" onClick={() => setOuterOpen(false)}>Close drawer</button>
      <button type="button" onClick={() => setInnerOpen(true)}>Open confirmation</button>
      {innerOpen && <div ref={innerRef} role="alertdialog" aria-label="Confirmation">
        <button ref={innerCloseRef} type="button" onClick={() => setInnerOpen(false)}>Keep</button>
        <button type="button" onClick={() => { setOuterOpen(false); setInnerOpen(false); }}>Confirm</button>
      </div>}
    </div>}
  </main>;
}

describe('dialog focus management', () => {
  it('closes only the top dialog, restores focus, traps Tab, and makes the background inert', async () => {
    const user = userEvent.setup();
    render(<NestedDialogs />);
    const opener = screen.getByRole('button', { name: 'Open drawer' });
    await user.click(opener);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close drawer' }));
    expect(opener.inert).toBe(true);

    const confirmationTrigger = screen.getByRole('button', { name: 'Open confirmation' });
    await user.click(confirmationTrigger);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep' }));
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    confirm.focus();
    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.activeElement).toBe(confirmationTrigger);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(opener.inert).not.toBe(true);
  });

  it('restores the page when nested dialogs unmount together', async () => {
    const user = userEvent.setup();
    render(<NestedDialogs />);
    const opener = screen.getByRole('button', { name: 'Open drawer' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Open confirmation' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(opener.inert).not.toBe(true);
    expect(opener.getAttribute('aria-hidden')).toBeNull();
  });
});
