import { useEffect, useRef, type RefObject } from 'react';
import { activeHtmlElement, makeDialogOutsideInert, observeDocumentKeydown } from '../../adapters/dialog-focus-effects';

interface DialogFocusOptions {
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement>;
  initialFocusRef?: RefObject<HTMLElement>;
  dismissible?: boolean;
}

const dialogStack: symbol[] = [];
const focusableSelector = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useDialogFocus({ open, onClose, containerRef, initialFocusRef, dismissible = true }: DialogFocusOptions): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const container = containerRef.current;
    if (!open || !container) return;
    const token = Symbol('dialog');
    const restoreTarget = activeHtmlElement();
    dialogStack.push(token);
    const restoreInert = makeDialogOutsideInert(container);
    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
    const initial = initialFocusRef?.current ?? focusables()[0] ?? container;
    if (!container.hasAttribute('tabindex')) container.tabIndex = -1;
    initial.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== token) return;
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && activeHtmlElement() === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeHtmlElement() === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const stopObserving = observeDocumentKeydown(onKeyDown);
    return () => {
      stopObserving();
      const index = dialogStack.lastIndexOf(token);
      if (index >= 0) dialogStack.splice(index, 1);
      restoreInert();
      if (restoreTarget?.isConnected) restoreTarget.focus();
    };
  }, [containerRef, dismissible, initialFocusRef, open]);
}
