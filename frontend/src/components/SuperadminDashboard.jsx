import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Shield, Plus, Building, Globe, Edit3, ArrowRight, ExternalLink, RefreshCw, Trash2 } from 'lucide-react';

export default function SuperadminDashboard() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form states
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [themeColor, setThemeColor] = useState('#e11d48');
  const [logo, setLogo] = useState('☕');

  const logoOptions = ['☕', '🍕', '🍔', '🍣', '🍹', '🍦', '🍩', '🥗', '🥩', '🌶️', '🍪', '🍜'];

  useEffect(() => {
    fetchRestaurants();
  }, []);

  const fetchRestaurants = async () => {
    try {
      setLoading(true);
      const data = await api.getAllRestaurants();
      setRestaurants(data);
    } catch (err) {
      setError('Could not load restaurant directory.');
    } finally {
      setLoading(false);
    }
  };

  const handleSlugChange = (val) => {
    const clean = val.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSlug(clean);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !slug || !adminUsername || !adminPassword) {
      alert('Please fill out all required fields.');
      return;
    }

    try {
      setSubmitLoading(true);
      await api.onboardRestaurant({ name, slug, themeColor, logo, adminUsername, adminPassword });
      alert('Cafe onboarded successfully! Seeded default tables, menus, and owner login credentials.');
      setName('');
      setSlug('');
      setAdminUsername('');
      setAdminPassword('');
      setThemeColor('#e11d48');
      setLogo('☕');
      fetchRestaurants();
    } catch (err) {
      alert(err.message || 'Failed to onboard restaurant.');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteRestaurant = async (restaurantId, restaurantName) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete "${restaurantName}"? This will permanently delete the cafe, all its tables, categories, menu items, and order history.`);
    if (!confirmDelete) return;

    try {
      await api.deleteRestaurant(restaurantId);
      alert('Cafe deleted successfully!');
      fetchRestaurants();
    } catch (err) {
      alert(err.message || 'Failed to delete cafe.');
    }
  };

  // Helper to generate the subdomained client URL
  const getSubdomainUrl = (restaurantSlug) => {
    const port = window.location.port ? `:${window.location.port}` : '';
    return `${window.location.protocol}//${restaurantSlug}.localhost${port}`;
  };

  if (loading && restaurants.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a', color: '#fff' }}>
        <RefreshCw className="animate-spin" size={42} style={{ color: '#e11d48' }} />
        <p style={{ marginTop: '1rem', color: '#94a3b8' }}>Loading tenant directory...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', padding: '2rem 1.5rem' }}>
      <header className="container" style={{ maxWidth: '1000px', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem', borderBottom: '1px solid #334155', paddingBottom: '1.25rem' }}>
        <Shield size={32} style={{ color: '#e11d48' }} />
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800' }}>Gatecode SaaS Hub</h1>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Superadmin tenant directory and cafe onboarding manager</p>
        </div>
      </header>

      <div className="container" style={{ maxWidth: '1000px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
        
        {/* Onboarding Form */}
        <section className="glassmorphism" style={{ padding: '1.75rem', borderRadius: 'var(--radius-xl)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={20} style={{ color: '#e11d48' }} /> Onboard New Restaurant
          </h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '0.5rem' }}>
                Cafe / Restaurant Name *
              </label>
              <input 
                type="text" 
                placeholder="E.g., Namo Cafe" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#fff' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '0.5rem' }}>
                Subdomain Slug * (Alphanumeric/hyphen)
              </label>
              <div style={{ display: 'flex', border: '1px solid #334155', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <input 
                  type="text" 
                  placeholder="E.g., namo" 
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.75rem', border: 'none', backgroundColor: '#1e293b', color: '#fff' }}
                />
                <span style={{ backgroundColor: '#334155', padding: '0.75rem', fontSize: '0.85rem', color: '#cbd5e1', fontWeight: '600' }}>
                  .localhost
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                Resolved URL: <code style={{ color: '#fb923c' }}>{slug || 'tenant'}.localhost:5173</code>
              </p>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '0.5rem' }}>
                Owner Username / Email *
              </label>
              <input 
                type="email" 
                placeholder="owner@cafe.com" 
                value={adminUsername}
                onChange={(e) => setAdminUsername(e.target.value)}
                required
                style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#fff' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '0.5rem' }}>
                Owner Initial Password *
              </label>
              <input 
                type="text" 
                placeholder="Set owner password" 
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                required
                style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#fff' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '0.5rem' }}>
                  Brand Emoji Logo
                </label>
                <select 
                  value={logo}
                  onChange={(e) => setLogo(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#fff', fontSize: '1.25rem' }}
                >
                  {logoOptions.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '0.5rem' }}>
                  Brand Color
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input 
                    type="color" 
                    value={themeColor}
                    onChange={(e) => setThemeColor(e.target.value)}
                    style={{ border: 'none', padding: 0, width: '40px', height: '40px', borderRadius: 'var(--radius-md)', cursor: 'pointer', backgroundColor: 'transparent' }}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>{themeColor}</span>
                </div>
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={submitLoading}
              style={{ width: '100%', padding: '0.85rem', marginTop: '0.5rem', borderRadius: 'var(--radius-full)' }}
            >
              {submitLoading ? 'Registering Tenant...' : 'Onboard Cafe'}
            </button>
          </form>
        </section>

        {/* Restaurants Directory */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building size={20} style={{ color: '#fb923c' }} /> Onboarded Tenants ({restaurants.length})
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '70vh', overflowY: 'auto', paddingRight: '4px' }}>
            {restaurants.map(rest => (
              <div 
                key={rest._id}
                style={{
                  backgroundColor: '#1e293b',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid #334155',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.75rem' }}>{rest.logo}</span>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', color: '#fff' }}>{rest.name}</h3>
                      <span className="badge" style={{ backgroundColor: `${rest.themeColor}15`, color: rest.themeColor, padding: '2px 8px', fontSize: '0.7rem', fontWeight: '700' }}>
                        Theme color: {rest.themeColor}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', backgroundColor: '#0f172a', padding: '4px 8px', borderRadius: '4px', border: '1px solid #334155' }}>
                      slug: **{rest.slug}**
                    </span>
                    <button 
                      onClick={() => handleDeleteRestaurant(rest._id, rest.name)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background-color 0.2s'
                      }}
                      title="Delete Cafe"
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #334155', paddingTop: '0.75rem', display: 'flex', gap: '1rem', fontSize: '0.8rem', flexWrap: 'wrap' }}>
                  <a 
                    href={getSubdomainUrl(rest.slug)} 
                    target="_blank" 
                    rel="noreferrer"
                    style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    Client Menu <ExternalLink size={12} />
                  </a>
                  <a 
                    href={`${getSubdomainUrl(rest.slug)}/admin`} 
                    target="_blank" 
                    rel="noreferrer"
                    style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    Chef POS <ExternalLink size={12} />
                  </a>
                  <a 
                    href={`${getSubdomainUrl(rest.slug)}/dashboard`} 
                    target="_blank" 
                    rel="noreferrer"
                    style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    Cafe Config <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
