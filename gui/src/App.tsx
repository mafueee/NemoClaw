import { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { DashboardPage } from './components/dashboard/DashboardPage';
import { OnboardWizard } from './components/onboard/OnboardWizard';
import { SandboxManager } from './components/sandbox/SandboxManager';
import { PolicyEditor } from './components/policy/PolicyEditor';
import { InferenceConfig } from './components/inference/InferenceConfig';
import { PortManager } from './components/ports/PortManager';
import { LogViewer } from './components/logs/LogViewer';
import { ChatInterface } from './components/chat/ChatInterface';

export default function App() {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <BrowserRouter>
            <div className="app-layout">
                {/* Sidebar */}
                <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                    <div className="sidebar-brand">
                        <div>
                            <h1>⚡ NemoClaw</h1>
                            <div className="brand-sub">Dashboard</div>
                        </div>
                    </div>

                    <nav className="sidebar-nav">
                        <div className="nav-section-title">Overview</div>
                        <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            onClick={() => setSidebarOpen(false)}>
                            📊 Dashboard
                        </NavLink>
                        <NavLink to="/onboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            onClick={() => setSidebarOpen(false)}>
                            🚀 Onboard
                        </NavLink>

                        <div className="nav-section-title">Sandboxes</div>
                        <NavLink to="/sandboxes" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            onClick={() => setSidebarOpen(false)}>
                            📦 Sandboxes
                        </NavLink>
                        <NavLink to="/logs" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            onClick={() => setSidebarOpen(false)}>
                            📋 Logs
                        </NavLink>
                        <NavLink to="/chat" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            onClick={() => setSidebarOpen(false)}>
                            💬 Agent Chat
                        </NavLink>

                        <div className="nav-section-title">Configuration</div>
                        <NavLink to="/inference" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            onClick={() => setSidebarOpen(false)}>
                            🧠 Inference
                        </NavLink>
                        <NavLink to="/policies" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            onClick={() => setSidebarOpen(false)}>
                            🛡️ Policies
                        </NavLink>
                        <NavLink to="/ports" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            onClick={() => setSidebarOpen(false)}>
                            🔌 Ports
                        </NavLink>
                    </nav>

                    <div style={{ padding: 'var(--nc-spacing-md)', borderTop: '1px solid var(--nc-border)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--nc-text-muted)' }}>
                            Powered by NVIDIA OpenShell
                        </div>
                    </div>
                </aside>

                {/* Main content */}
                <main className="main-content">
                    <Routes>
                        <Route path="/" element={<DashboardPage />} />
                        <Route path="/onboard" element={<OnboardWizard />} />
                        <Route path="/sandboxes" element={<SandboxManager />} />
                        <Route path="/policies" element={<PolicyEditor />} />
                        <Route path="/inference" element={<InferenceConfig />} />
                        <Route path="/ports" element={<PortManager />} />
                        <Route path="/logs" element={<LogViewer />} />
                        <Route path="/chat" element={<ChatInterface />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    );
}
