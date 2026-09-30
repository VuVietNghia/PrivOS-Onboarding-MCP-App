export interface InertSnapshot {
  element: HTMLElement;
  inert: boolean;
  ariaHidden: string | null;
}

interface InertOwnership extends InertSnapshot {
  owners: number;
}

const inertOwnership = new WeakMap<HTMLElement, InertOwnership>();

export function activeHtmlElement(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

export function makeDialogOutsideInert(container: HTMLElement): () => void {
  const acquired: HTMLElement[] = [];
  let current: HTMLElement | null = container;
  while (current.parentElement) {
    for (const sibling of Array.from(current.parentElement.children)) {
      if (!(sibling instanceof HTMLElement) || sibling === current) continue;
      const ownership = inertOwnership.get(sibling);
      if (ownership) ownership.owners += 1;
      else inertOwnership.set(sibling, {
        element: sibling,
        inert: sibling.inert,
        ariaHidden: sibling.getAttribute('aria-hidden'),
        owners: 1,
      });
      acquired.push(sibling);
      sibling.inert = true;
      sibling.setAttribute('aria-hidden', 'true');
    }
    current = current.parentElement;
    if (current === document.body) break;
  }
  return () => {
    for (const element of acquired) {
      const ownership = inertOwnership.get(element);
      if (!ownership) continue;
      ownership.owners -= 1;
      if (ownership.owners > 0) continue;
      element.inert = ownership.inert;
      if (ownership.ariaHidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', ownership.ariaHidden);
      inertOwnership.delete(element);
    }
  };
}

export function observeDocumentKeydown(listener: (event: KeyboardEvent) => void): () => void {
  document.addEventListener('keydown', listener, true);
  return () => document.removeEventListener('keydown', listener, true);
}
