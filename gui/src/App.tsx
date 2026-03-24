import { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useParams } from 'react-router-dom';
import { DashboardPage } from './components/dashboard/DashboardPage';
import { OnboardWizard } from './components/onboard/OnboardWizard';
import { SandboxManager } from './components/sandbox/SandboxManager';
import { PolicyEditor } from './components/policy/PolicyEditor';
import { InferenceConfig } from './components/inference/InferenceConfig';
import { PortManager } from './components/ports/PortManager';
import { LogViewer } from './components/logs/LogViewer';
import { ChatInterface } from './components/chat/ChatInterface';
import { ClawList } from './components/claws/ClawList';
import { ClawDetail } from './components/claws/ClawDetail';
import { ClawCreate } from './components/claws/ClawCreate';

// Wrapper components to pass navigation to claw pages
function ClawListPage() {
    const navigate = useNavigate();
    return <ClawList onNavigate={(path) => navigate(path)} />;
}
function ClawDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    return <ClawDetail clawId={id!} onNavigate={(path) => navigate(path)} />;
}
function ClawCreatePage() {
    const navigate = useNavigate();
    return <ClawCreate onNavigate={(path) => navigate(path)} />;
}

export default function App() {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const closeSidebar = () => setSidebarOpen(false);

    return (
        <BrowserRouter>
            <div className="app-layout">
                {/* Mobile Header */}
                <header className="mobile-header">
                    <button
                        className="hamburger-btn"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        aria-label="Toggle navigation"
                    >
                        {sidebarOpen ? '✕' : '☰'}
                    </button>
                    <span className="mobile-header-title">⚡ NemoClaw</span>
                </header>

                {/* Sidebar Backdrop (mobile) */}
                {sidebarOpen && (
                    <div className="sidebar-backdrop" onClick={closeSidebar} />
                )}

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
                            onClick={closeSidebar}>
                            📊 Dashboard
                        </NavLink>
                        <NavLink to="/onboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            onClick={closeSidebar}>
                            🚀 Onboard
                        </NavLink>

                        <div className="nav-section-title">Claws</div>
                        <NavLink to="/claws" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            onClick={closeSidebar}>
                            🐾 All Claws
                        </NavLink>
                        <NavLink to="/claws/new" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            onClick={closeSidebar}>
                            ✨ New Claw
                        </NavLink>

                        <div className="nav-section-title">Sandboxes</div>
                        <NavLink to="/sandboxes" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            onClick={closeSidebar}>
                            📦 Sandboxes
                        </NavLink>
                        <NavLink to="/logs" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            onClick={closeSidebar}>
                            📋 Logs
                        </NavLink>
                        <NavLink to="/chat" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            onClick={closeSidebar}>
                            💬 Agent Chat
                        </NavLink>

                        <div className="nav-section-title">Configuration</div>
                        <NavLink to="/inference" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            onClick={closeSidebar}>
                            🧠 Inference
                        </NavLink>
                        <NavLink to="/policies" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            onClick={closeSidebar}>
                            🛡️ Policies
                        </NavLink>
                        <NavLink to="/ports" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            onClick={closeSidebar}>
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
                        <Route path="/claws" element={<ClawListPage />} />
                        <Route path="/claws/new" element={<ClawCreatePage />} />
                        <Route path="/claws/:id" element={<ClawDetailPage />} />
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
