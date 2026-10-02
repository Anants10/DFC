import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api.js';

const Ctx = createContext(null);

export function AppProvider({ children }) {
  // UI
  const [darkMode,  setDarkMode]  = useState(false);
  const [fontSize,  setFontSize]  = useState('md');
  // Model
  const [modelLoaded,  setModelLoaded]  = useState(false);
  const [modelName,    setModelName]    = useState('');
  const [threshold,    setThreshold]    = useState(0.5);
  const [imgSize,      setImgSize]      = useState(224);
  // Server status
  const [backendOk, setBackendOk] = useState(null);
  const [mlOk,      setMlOk]      = useState(null);
  const [tfOk,      setTfOk]      = useState(null);
  // Events
  const [events, setEvents] = useState([]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    const s = { sm: '13px', md: '15px', lg: '18px' };
    document.documentElement.style.fontSize = s[fontSize] || '15px';
  }, [fontSize]);

  const refreshEvents = useCallback(async () => {
    try {
      const d = await api.getEvents();
      if (d.success) { setEvents(d.events); setBackendOk(true); }
    } catch { setBackendOk(false); }
  }, []);

  const checkMl = useCallback(async () => {
    try {
      const d = await api.mlHealth();
      setMlOk(!!d.ok);
      setTfOk(d.keras_ok === true);
      if (d.loaded && d.model) { setModelLoaded(true); setModelName(d.model); }
    } catch { setMlOk(false); setTfOk(null); }
  }, []);

  useEffect(() => { refreshEvents(); checkMl(); }, [refreshEvents, checkMl]);

  const addEvent    = useCallback(ev  => setEvents(p => [ev, ...p]), []);
  const removeEvent = useCallback(async id => {
    const r = await api.deleteEvent(id);
    if (r.success) setEvents(p => p.filter(e => (e.eventId || e._id) !== id));
    return r;
  }, []);

  return (
    <Ctx.Provider value={{
      darkMode, setDarkMode, fontSize, setFontSize,
      modelLoaded, setModelLoaded, modelName, setModelName,
      threshold, setThreshold, imgSize, setImgSize,
      backendOk, mlOk, setMlOk, tfOk, setTfOk, checkMl,
      events, addEvent, removeEvent, refreshEvents,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp must be inside AppProvider');
  return c;
};
