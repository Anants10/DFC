import React, { useState, useCallback } from 'react';
import { AppProvider }  from './context/AppContext.jsx';
import Header           from './components/layout/Header.jsx';
import Navbar           from './components/layout/Navbar.jsx';
import Footer           from './components/layout/Footer.jsx';
import Toast            from './components/ui/Toast.jsx';
import HelpModal        from './components/ui/HelpModal.jsx';
import { useToast }     from './hooks/useToast.js';
import Dashboard        from './pages/Dashboard/Dashboard.jsx';
import ModelManager     from './pages/ModelManager/ModelManager.jsx';
import ImageAnalysis    from './pages/ImageAnalysis/ImageAnalysis.jsx';
import VideoLive        from './pages/VideoLive/VideoLive.jsx';
import DetectionLog     from './pages/DetectionLog/DetectionLog.jsx';

function Shell() {
  const [tab, setTab]             = useState('dashboard');
  const [helpOpen, setHelpOpen]   = useState(false);
  const [helpFeature, setHelpFeature] = useState('overview');
  const { toasts, show, confirm, dismiss } = useToast();

  const openHelp = useCallback((feature = 'overview') => {
    setHelpFeature(feature);
    setHelpOpen(true);
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <Navbar active={tab} onChange={setTab} onHelp={() => openHelp('overview')} />
      <main style={{ flex: 1, background: 'var(--bg)', padding: '24px 0 40px' }}>
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 24px' }}>
          {tab === 'dashboard' && <Dashboard   openHelp={openHelp} />}
          {tab === 'model'     && <ModelManager showToast={show}    openHelp={openHelp} />}
          {tab === 'image'     && <ImageAnalysis showToast={show}   openHelp={openHelp} />}
          {tab === 'video'     && <VideoLive    showToast={show}    openHelp={openHelp} />}
          {tab === 'log'       && <DetectionLog showToast={show}    confirmToast={confirm} openHelp={openHelp} />}
        </div>
      </main>
      <Footer />
      <HelpModal
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        initialFeature={helpFeature}
      />
      <Toast toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>;
}
