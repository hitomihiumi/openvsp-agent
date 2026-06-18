import { useState, useEffect } from 'react';
import ChatPanel from './ChatPanel';
import SimulationPanel from './SimulationPanel';
import { useDesignStore } from '../hooks/useDesignStore';

export default function App() {
  const [serverPort, setServerPort] = useState(null);
  const designs = useDesignStore((s) => s.designs);

  useEffect(() => {
    async function init() {
      const port = await window.api.getServerPort();
      setServerPort(port);
    }
    init();
  }, []);

  if (!serverPort) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>Starting server...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>OpenVSP AI Agent</h1>
          <span className="subtitle">Autonomous Drone Design</span>
        </div>
      </header>

      <main className="app-main">
        <ChatPanel serverPort={serverPort} />
        <SimulationPanel />
      </main>
    </div>
  );
}
