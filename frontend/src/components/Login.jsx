import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api';
import { Shield, Key, User, RefreshCw, ArrowLeft } from 'lucide-react';

export default function Login() {
  const [restaurant, setRestaurant] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState(null);

  const navigate = useNavigate();
  const location = useLocation();

  // If already authenticated, redirect to admin POS
  useEffect(() => {
    if (api.isAuthenticated()) {
      const redirectPath = location.state?.from || '/admin';
      navigate(redirectPath);
    }
  }, [navigate, location]);

  useEffect(() => {
    async function loadTenantBranding() {
      try {
        setLoading(true);
        const tenantData = await api.getRestaurantInfo();
        setRestaurant(tenantData.restaurant);
      } catch (err) {
        console.error(err);
        setError('Could not load Cafe details. Please check connection.');
      } finally {
        setLoading(false);
      }
    }
    loadTenantBranding();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      alert('Please enter your username and password.');
      return;
    }

    try {
      setSubmitLoading(true);
      await api.login(username, password);
      // Success, route to requested target
      const redirectPath = location.state?.from || '/admin';
      navigate(redirectPath);
    } catch (err) {
      alert(err.message || 'Invalid credentials.');
    } finally {
      setSubmitLoading(false);
    }
  };

  if (loading && !restaurant) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a', color: '#fff' }}>
        <RefreshCw className="animate-spin" size={42} style={{ color: '#e11d48' }} />
        <p style={{ marginTop: '1rem', color: '#94a3b8' }}>Loading secure portal...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at 10% 20%, rgb(4, 8, 15) 0%, rgb(16, 24, 48) 90.1%)', color: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      
      <div className="glassmorphism animate-scale-up" style={{ width: '100%', maxWidth: '420px', padding: '2.5rem 2rem', borderRadius: 'var(--radius-xl)', border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: 'var(--shadow-xl)' }}>
        
        {/* Branding Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: '0.5rem', animation: 'animate-float 3s ease-in-out infinite' }}>
            {restaurant?.logo || '🍕'}
          </span>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#fff' }}>
            {restaurant?.name} Admin Secure Access
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
            Sign in to access your Chef POS panel and Menu customizer dashboard.
          </p>
        </div>

        {error ? (
          <div style={{ backgroundColor: 'rgba(244, 63, 94, 0.1)', color: '#f43f5e', padding: '1rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '1.5rem' }}>
            {error}
          </div>
        ) : null}

        {/* Login Form */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '0.5rem' }}>
              Username / Email
            </label>
            <div style={{ display: 'flex', border: '1px solid #334155', borderRadius: 'var(--radius-md)', overflow: 'hidden', backgroundColor: '#1e293b' }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', color: '#64748b' }}>
                <User size={16} />
              </span>
              <input 
                type="text" 
                placeholder="Enter admin username" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={{ width: '100%', padding: '0.7rem 0.5rem', border: 'none', background: 'none', color: '#fff', fontSize: '0.9rem' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '0.5rem' }}>
              Password
            </label>
            <div style={{ display: 'flex', border: '1px solid #334155', borderRadius: 'var(--radius-md)', overflow: 'hidden', backgroundColor: '#1e293b' }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', color: '#64748b' }}>
                <Key size={16} />
              </span>
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ width: '100%', padding: '0.7rem 0.5rem', border: 'none', background: 'none', color: '#fff', fontSize: '0.9rem' }}
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={submitLoading}
            style={{ width: '100%', padding: '0.85rem', marginTop: '0.5rem', borderRadius: 'var(--radius-full)', backgroundColor: restaurant?.themeColor || 'hsl(var(--primary))' }}
          >
            {submitLoading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '1rem' }}>
          <a href="/portal" style={{ fontSize: '0.75rem', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <ArrowLeft size={12} /> Return to Onboarding Portal
          </a>
        </div>

      </div>

    </div>
  );
}
