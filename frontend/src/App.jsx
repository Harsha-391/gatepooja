import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import CustomerMenu from './components/CustomerMenu';
import AdminDashboard from './components/AdminDashboard';
import CafeAdminDashboard from './components/CafeAdminDashboard';
import SuperadminDashboard from './components/SuperadminDashboard';
import Login from './components/Login';
import { Shield, Smartphone, ArrowRight, ExternalLink, Globe, Layout, ChefHat } from 'lucide-react';

// Wildcard Subdomain Detection Helper
const getSubdomain = () => {
  const host = window.location.hostname;
  // Ignore standard localhost and www hosts
  if (host === 'localhost' || host === '127.0.0.1') return null;
  
  const parts = host.split('.');
  if (parts.length > 1 && parts[parts.length - 2] !== 'www') {
    return parts[0]; // E.g., 'namo' for 'namo.localhost'
  }
  return null;
};

// Simulation Landing Portal (displayed only when no subdomain is resolved)
function TestPortal() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTenants() {
      try {
        const res = await fetch('http://localhost:5000/api/restaurants');
        if (res.ok) {
          const data = await res.json();
          setRestaurants(data);
        }
      } catch (err) {
        console.warn('Backend server is starting up...', err);
      } finally {
        setLoading(false);
      }
    }
    const interval = setInterval(fetchTenants, 3000);
    fetchTenants();
    return () => clearInterval(interval);
  }, []);

  const getSubdomainUrl = (slug) => {
    const port = window.location.port ? `:${window.location.port}` : '';
    return `${window.location.protocol}//${slug}.localhost${port}`;
  };

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at 10% 20%, rgb(4, 8, 15) 0%, rgb(16, 24, 48) 90.1%)', color: '#f8fafc', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* SaaS Portal Header */}
      <header style={{ textAlign: 'center', marginBottom: '3rem', maxWidth: '650px', marginTop: '1.5rem' }}>
        <span className="badge badge-primary animate-pulse-glow" style={{ padding: '6px 16px', fontSize: '0.85rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          SaaS Wildcard Subdomains
        </span>
        <h1 style={{ fontSize: '2.5rem', fontWeight: '800', lineHeight: '1.2', background: 'linear-gradient(to right, #f43f5e, #fb923c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.75rem' }}>
          Gatecode Cafe Management Software
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>
          Onboard multiple cafes, manage their menus/customizations, print QR tables, and test subdomaining routes natively in local dev.
        </p>
      </header>

      {/* Grid Dashboard */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '850px' }}>
        
        {/* Superadmin Panel */}
        <section style={{ backgroundColor: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255, 255, 255, 0.08)', backdropFilter: 'blur(16px)', borderRadius: 'var(--radius-xl)', padding: '1.5rem 2rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Shield style={{ color: '#f43f5e' }} size={20} /> Gatecode SaaS Admin
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', maxWidth: '450px' }}>
              Onboard new cafes, assign subdomains, configure visual branding themes, and monitor list.
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Link 
              to="/admin"
              className="btn btn-primary"
              style={{ padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-full)', fontSize: '0.8rem', letterSpacing: '0.05em' }}
            >
              Open Admin
            </Link>
          </div>
        </section>

        {/* Tenant Directory */}
        <section style={{ backgroundColor: 'rgba(30, 41, 59, 0.25)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: 'var(--radius-xl)', padding: '2rem' }}>
          <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.75rem', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Globe style={{ color: '#fb923c' }} size={20} /> Wildcard Subdomain Directory
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '4px' }}>
              We automatically resolve subdomain redirects in local development. E.g. clicking a link below will route you to the tenant's isolated environment.
            </p>
          </div>

          {restaurants.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.9rem' }}>
              No tenant cafes registered yet. Please click **Open Superadmin** above to register a cafe!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {restaurants.map(rest => (
                <div 
                  key={rest._id}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.25rem',
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '2rem' }}>{rest.logo}</span>
                    <div>
                      <h4 style={{ fontWeight: '700', fontSize: '1.1rem', color: '#fff' }}>{rest.name}</h4>
                      <span style={{ fontSize: '0.75rem', color: rest.themeColor, fontWeight: '700' }}>
                        Subdomain: {rest.slug}.localhost
                      </span>
                    </div>
                  </div>

                  {/* Onboard Diagnostics */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <a 
                      href={`${getSubdomainUrl(rest.slug)}/dashboard`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary"
                      style={{ padding: '0.45rem 1rem', fontSize: '0.75rem', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Layout size={12} /> Menu Customizer <ExternalLink size={10} />
                    </a>
                    
                    <a 
                      href={`${getSubdomainUrl(rest.slug)}/admin`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary"
                      style={{ padding: '0.45rem 1rem', fontSize: '0.75rem', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <ChefHat size={12} /> POS Dashboard <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>

      <footer style={{ marginTop: 'auto', paddingTop: '3rem', fontSize: '0.8rem', color: '#64748b' }}>
        Built with MERN Wildcard Subdomains and CSS Breakpoints
      </footer>
    </div>
  );
}

export default function App() {
  const subdomain = getSubdomain();

  // If we are accessing via a tenant subdomain (e.g. 'namo.localhost' or 'admin.localhost')
  if (subdomain) {
    if (subdomain === 'admin' || subdomain === 'superadmin') {
      return (
        <BrowserRouter>
          <Routes>
            <Route path="/*" element={<SuperadminDashboard />} />
          </Routes>
        </BrowserRouter>
      );
    }
    
    // Scoped tenant routing
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<CustomerMenu />} />
          <Route path="/t/:tableId" element={<CustomerMenu />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/dashboard" element={<CafeAdminDashboard />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // Fallback routing (supporting standard routes for local testing without subdomains)
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SuperadminDashboard />} />
        <Route path="/portal" element={<TestPortal />} />
        <Route path="/admin" element={<SuperadminDashboard />} />
        <Route path="/superadmin" element={<SuperadminDashboard />} />
        
        {/* We have removed path-based fallback routing (e.g., /r/:restaurantSlug) to enforce strict subdomain isolation */}
      </Routes>
    </BrowserRouter>
  );
}
