import { useState, useCallback } from 'react';
export function useToast() {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback(id => setToasts(p => p.filter(t => t.id !== id)), []);
  const show = useCallback((msg, type = 'info', dur = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p, { id, message: msg, type }]);
    if (type !== 'confirm' && dur > 0) setTimeout(() => dismiss(id), dur);
    return id;
  }, [dismiss]);
  const confirm = useCallback((msg, onOk) => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p, {
      id, message: msg, type: 'confirm',
      onConfirm: () => { dismiss(id); onOk(); },
      onCancel:  () => dismiss(id),
    }]);
    setTimeout(() => dismiss(id), 12000);
  }, [dismiss]);
  return { toasts, show, confirm, dismiss };
}
