'use client';

import { useEffect } from 'react';

// ponytail: browser-level guard only. In-app <Link> interception needs a
// router-level dialog; add when a settings page has multi-step unsaved state
// worth an explicit "Discard changes?" prompt.
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}
