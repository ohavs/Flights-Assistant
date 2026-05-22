import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import ConfirmModal from './components/ConfirmModal';

const ConfirmContext = createContext(() => Promise.resolve(false));

export function useConfirm() {
  return useContext(ConfirmContext);
}

// Provides a confirm() helper that returns a Promise<boolean>. Resolves
// true on confirm, false on cancel/close. Renders a single ConfirmModal
// at the app root so we don't need per-component state for each delete.
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { open, opts, resolver }
  const resolverRef = useRef(null);

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ open: true, opts });
    });
  }, []);

  const handleConfirm = () => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setState(null);
    r?.(true);
  };

  const handleClose = () => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setState(null);
    r?.(false);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmModal
        isOpen={!!state?.open}
        title={state?.opts?.title || 'אישור'}
        message={state?.opts?.message || ''}
        confirmText={state?.opts?.confirmText || 'אישור'}
        cancelText={state?.opts?.cancelText || 'ביטול'}
        danger={!!state?.opts?.danger}
        onConfirm={handleConfirm}
        onClose={handleClose}
      />
    </ConfirmContext.Provider>
  );
}
