import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Terminal, 
  Send, 
  Activity, 
  Coins, 
  Compass, 
  Cpu, 
  Radio, 
  ShieldCheck, 
  Sparkles,
  Layers
} from 'lucide-react';
import type { HealthResponse, ServerMessage, MayorCommand } from '@visoagent/protocol';

export const App: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [orderPrompt, setOrderPrompt] = useState('');
  const [specialist, setSpecialist] = useState<'worker' | 'architect' | 'runner'>('worker');
  const [effort, setEffort] = useState<'low' | 'medium' | 'high' | 'max'>('high');
  const [messages, setMessages] = useState<string[]>([
    'SYSTEM: VisoAgent Spatial AI Engine initialized.',
    'RADIO: Welcome, Mayor. The city grid is standing by for construction orders.',
  ]);

  // Fetch backend health endpoint
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/health');
        if (res.ok) {
          const data: HealthResponse = await res.json();
          setHealth(data);
        }
      } catch (err) {
        console.error('Failed to reach health endpoint', err);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  // Connect to WebSocket
  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        setWsStatus('connected');
        setMessages(prev => [...prev, 'SYSTEM: WebSocket stream connected to Fastify backend.']);
        
        // Send initial auth or travel command
        const authCmd: MayorCommand = {
          type: 'session.auth',
          token: 'demo-local-token',
        };
        socket?.send(JSON.stringify(authCmd));
      };

      socket.onmessage = (event) => {
        try {
          const msg: ServerMessage = JSON.parse(event.data);
          if (msg.type === 'cities.roster') {
            setMessages(prev => [...prev, `ROSTER: Discovered ${msg.cities.length} city sector(s).`]);
          } else if (msg.type === 'error') {
            setMessages(prev => [...prev, `ERROR: ${msg.message}`]);
          }
        } catch {
          // ignore unparsed messages
        }
      };

      socket.onclose = () => {
        setWsStatus('disconnected');
      };

      socket.onerror = () => {
        setWsStatus('disconnected');
      };
    } catch {
      setWsStatus('disconnected');
    }

    return () => {
      socket?.close();
    };
  }, []);

  const handleDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderPrompt.trim()) return;

    setMessages(prev => [
      ...prev,
      `MAYOR ORDER [${specialist.toUpperCase()}/${effort.toUpperCase()}]: ${orderPrompt.trim()}`
    ]);
    setOrderPrompt('');
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top Navigation Bar */}
      <header style={{
        height: '52px',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-color)',
        background: 'rgba(9, 9, 11, 0.95)',
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
            color: '#ffffff'
          }}>
            <Building2 size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 800, fontSize: '15px', letterSpacing: '-0.02em' }}>VISOAGENT</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>CLAUDE CITY</span>
            </div>
          </div>
        </div>

        {/* Telemetry / Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="badge badge-success" title="Treasury spend ceiling">
            <Coins size={12} />
            <span>TREASURY: $0.00 / $1.00</span>
          </div>

          <div className={`badge ${wsStatus === 'connected' ? 'badge-success' : wsStatus === 'connecting' ? 'badge-warning' : 'badge-error'}`}>
            <span className={`pulse-dot ${wsStatus === 'connected' ? 'pulse-dot-green' : wsStatus === 'connecting' ? 'pulse-dot-amber' : 'pulse-dot-red'}`} />
            <span>WS: {wsStatus.toUpperCase()}</span>
          </div>

          <div className={`badge ${health ? 'badge-success' : 'badge-warning'}`}>
            <Activity size={12} />
            <span>SERVER: {health ? `v${health.version}` : 'CHECKING'}</span>
          </div>
        </div>
      </header>

      {/* Main Workspace: Spatial Canvas + Floating HUD */}
      <main style={{ flex: 1, position: 'relative', display: 'flex', overflow: 'hidden' }}>
        {/* Isometric Canvas Placeholder Viewport */}
        <div style={{
          flex: 1,
          backgroundColor: '#0c0d12',
          backgroundImage: 'radial-gradient(circle at 50% 50%, #171923 0%, #090a0f 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}>
          {/* Spatial Grid Placeholder Art */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            textAlign: 'center',
            padding: '24px',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            background: 'rgba(0, 0, 0, 0.4)',
            maxWidth: '480px'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '12px',
              background: 'rgba(249, 115, 22, 0.1)',
              border: '1px solid rgba(249, 115, 22, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)'
            }}>
              <Compass size={32} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>Isometric Spatial Canvas Shell</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Phaser 3 isometric engine and block-treemap world generator will project repo files as 3D isometric structures.
              </p>
            </div>
            <div className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Target Repo: {health?.repoPath || 'Active Workspace'}
            </div>
          </div>
        </div>

        {/* Left Floating HUD: Mayor Console & Transmissions */}
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          width: '380px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          zIndex: 40
        }}>
          {/* Console Transmissions */}
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', maxHeight: '320px' }}>
            <div className="panel-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Radio size={14} color="var(--accent)" />
                <span>Radio Transmissions</span>
              </div>
              <span className="font-mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>8-BIT QUEST LOG</span>
            </div>
            <div className="font-mono" style={{
              padding: '12px',
              fontSize: '12px',
              color: '#d4d4d8',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              maxHeight: '240px'
            }}>
              {messages.map((msg, idx) => (
                <div key={idx} style={{ lineHeight: '1.4', wordBreak: 'break-word' }}>
                  <span style={{ color: msg.startsWith('MAYOR') ? 'var(--accent)' : msg.startsWith('ERROR') ? 'var(--danger)' : 'var(--text-muted)' }}>
                    &gt; {msg}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Floating HUD: Inspector Preview */}
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          width: '320px',
          zIndex: 40
        }}>
          <div className="panel">
            <div className="panel-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={14} color="var(--info)" />
                <span>City Inspector</span>
              </div>
            </div>
            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                <span className="font-mono" style={{ color: 'var(--success)' }}>ONLINE</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Mode:</span>
                <span className="font-mono">Local Scaffold</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Permission Gate:</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#38bdf8' }}>
                  <ShieldCheck size={14} /> Ask Mayor
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Floating HUD: Mayor's Order Dispatcher */}
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(90vw, 760px)',
          zIndex: 40
        }}>
          <form onSubmit={handleDispatch} className="panel" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={14} color="var(--accent)" />
                <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Mayor's Construction Order
                </span>
              </div>

              {/* Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Specialist */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <Cpu size={12} color="var(--text-muted)" />
                  <select 
                    value={specialist} 
                    onChange={(e) => setSpecialist(e.target.value as 'worker' | 'architect' | 'runner')}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '11px', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="worker" style={{ background: '#18181b' }}>Worker (Sonnet)</option>
                    <option value="architect" style={{ background: '#18181b' }}>Architect (Opus)</option>
                    <option value="runner" style={{ background: '#18181b' }}>Runner (Haiku)</option>
                  </select>
                </div>

                {/* Effort */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <Sparkles size={12} color="var(--warning)" />
                  <select 
                    value={effort} 
                    onChange={(e) => setEffort(e.target.value as 'low' | 'medium' | 'high' | 'max')}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '11px', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="low" style={{ background: '#18181b' }}>Low Effort</option>
                    <option value="medium" style={{ background: '#18181b' }}>Medium Effort</option>
                    <option value="high" style={{ background: '#18181b' }}>High Effort</option>
                    <option value="max" style={{ background: '#18181b' }}>Max Effort</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Input Row */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={orderPrompt}
                onChange={(e) => setOrderPrompt(e.target.value)}
                placeholder="Issue natural language instructions to your AI construction crew..."
                style={{
                  flex: 1,
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
              <button type="submit" className="btn btn-primary">
                <Send size={14} />
                <span>DISPATCH</span>
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default App;
