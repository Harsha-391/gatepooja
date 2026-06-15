import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, getSocket } from '../api';
import { 
  Users, CheckCircle, RefreshCw, Volume2, Shield, DollarSign, Layers, PlusCircle, AlertCircle, ShoppingCart
} from 'lucide-react';

export default function AdminDashboard() {
  const params = useParams();
  const navigate = useNavigate();
  const [restaurant, setRestaurant] = useState(null);
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('tables'); // 'tables', 'kot', 'inspector' for mobile

  // Play synthesized audio notification sound using Web Audio API (no external file needed)
  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      // First beep
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      gain1.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc1.start(audioCtx.currentTime);
      osc1.stop(audioCtx.currentTime + 0.15);

      // Second beep
      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
        gain2.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc2.start(audioCtx.currentTime);
        osc2.stop(audioCtx.currentTime + 0.2);
      }, 150);

      // Third beep
      setTimeout(() => {
        const osc3 = audioCtx.createOscillator();
        const gain3 = audioCtx.createGain();
        osc3.connect(gain3);
        gain3.connect(audioCtx.destination);
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(783.99, audioCtx.currentTime); // G5
        gain3.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain3.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc3.start(audioCtx.currentTime);
        osc3.stop(audioCtx.currentTime + 0.3);
      }, 300);

    } catch (err) {
      console.warn('Web Audio playback failed or blocked:', err);
    }
  };

  const getSlug = () => {
    if (params.restaurantSlug) {
      return params.restaurantSlug;
    }
    // Subdomain detection
    const host = window.location.hostname;
    const parts = host.split('.');
    if (parts.length > 1 && parts[parts.length - 2] !== 'www') {
      return parts[0];
    }
    return 'bite-of-italy'; // Seeded default fallback
  };

  // 1. Load Restaurant details and dashboard data & verify auth
  useEffect(() => {
    if (!api.isAuthenticated()) {
      navigate('/login', { state: { from: window.location.pathname } });
      return;
    }

    let active = true;

    async function loadDashboard() {
      try {
        setLoading(true);
        const resolvedSlug = getSlug();
        api.saveTenantSlug(resolvedSlug);

        const tenantData = await api.getRestaurantInfo();
        const restObj = tenantData.restaurant;
        if (active) setRestaurant(restObj);

        const data = await api.getDashboardData();
        if (active) {
          setTables(data.tables || []);
          setOrders(data.activeOrders || []);
        }
      } catch (err) {
        console.error(err);
        if (active) setError('Failed to load dashboard data. Check database.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, [params.restaurantSlug, navigate]);

  // 2. Setup Socket Connection when Restaurant ID is resolved
  useEffect(() => {
    if (!restaurant?._id) return;

    const socket = getSocket();
    socket.connect();

    const handleConnect = () => {
      setIsConnected(true);
      socket.emit('join_admin', { restaurantId: restaurant._id });
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    if (socket.connected) {
      setIsConnected(true);
      socket.emit('join_admin', { restaurantId: restaurant._id });
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    // Real-time listener for new order placement
    socket.on('new_order', (newOrder) => {
      setOrders((prev) => [newOrder, ...prev]);
      playNotificationSound();
    });

    // Real-time listener for order status change notifications
    socket.on('order_updated', (updatedOrder) => {
      setOrders((prev) => 
        prev.map((o) => (o._id === updatedOrder._id ? { ...o, status: updatedOrder.status } : o))
      );
    });

    // Real-time listener for table state alterations
    socket.on('table_status_change', (data) => {
      setTables((prev) => 
        prev.map((t) => {
          if (t._id === data.tableId) {
            const updatedTable = { 
              ...t, 
              status: data.status,
              verifiedMobileNumber: data.verifiedMobileNumber !== undefined ? data.verifiedMobileNumber : t.verifiedMobileNumber
            };
            if (data.activeCart !== undefined) {
              updatedTable.activeCart = data.activeCart;
            }
            // If selectedTable is this one, update the selection state too
            setSelectedTable(curr => curr?._id === t._id ? updatedTable : curr);
            return updatedTable;
          }
          return t;
        })
      );
    });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('new_order');
      socket.off('order_updated');
      socket.off('table_status_change');
    };
  }, [restaurant?._id]);

  const handleUpdateStatus = async (orderId, newStatus) => {
    try {
      await api.updateOrderStatus(orderId, newStatus);
      // Let the socket event handle the state update to ensure sync
    } catch (err) {
      alert('Failed to update order status');
    }
  };

  const handleClearTable = async (tableId) => {
    try {
      await api.clearTable(tableId);
      // Let socket event update table status in UI
      if (selectedTable?._id === tableId) {
        setSelectedTable(prev => prev ? { ...prev, status: 'vacant', activeCart: [] } : null);
      }
      setOrders(prev => prev.filter(o => o.tableId?._id !== tableId && o.tableId !== tableId));
    } catch (err) {
      alert('Failed to clear table');
    }
  };

  // Helper to fetch active orders for a specific table
  const getTableActiveOrders = (tableId) => {
    return orders.filter(o => (o.tableId?._id === tableId || o.tableId === tableId));
  };

  const getTableStatusLabel = (status) => {
    switch (status) {
      case 'vacant': return { text: 'Vacant', bg: 'badge-muted' };
      case 'occupied': return { text: 'Adding Cart', bg: 'badge-warning' };
      case 'ordered': return { text: 'KOT Sent', bg: 'badge-primary' };
      case 'billed': return { text: 'Bill Pending', bg: 'badge-success' };
      default: return { text: status, bg: 'badge-muted' };
    }
  };

  const getStatusColorClass = (status) => {
    switch (status) {
      case 'vacant': return 'border-transparent bg-slate-100 hover:bg-slate-200';
      case 'occupied': return 'border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-900';
      case 'ordered': return 'border-rose-400 bg-rose-50 hover:bg-rose-100 text-rose-900 animate-pulse-glow';
      case 'billed': return 'border-emerald-400 bg-emerald-50 hover:bg-emerald-100 text-emerald-900';
      default: return 'border-transparent';
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
        <RefreshCw className="animate-spin" style={{ color: 'hsl(var(--primary))' }} size={40} />
        <div style={{ fontWeight: '600', color: 'hsl(var(--text-muted))' }}>Loading POS dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', gap: '1.5rem', padding: '2rem' }}>
        <div style={{ fontSize: '48px' }}>❌</div>
        <h3 style={{ color: 'hsl(var(--danger))' }}>Dashboard Error</h3>
        <p style={{ color: 'hsl(var(--text-muted))' }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc' }} className="dark-theme">
      {/* Admin Top Header */}
      <header style={{ borderBottom: '1px solid #334155', padding: '1rem 1.5rem', backgroundColor: '#1e293b' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '2.2rem' }}>📊</span>
            <div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: '800' }}>{restaurant?.name} POS Panel</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge badge-success" style={{ fontSize: '0.75rem', padding: '2px 8px' }}>
                  Dine-in QR Admin
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: isConnected ? '#10b981' : '#ef4444' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isConnected ? '#10b981' : '#ef4444' }}></span>
                  {isConnected ? 'Real-time Connected' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-secondary" onClick={playNotificationSound} style={{ backgroundColor: '#334155', border: 'none', color: '#fff' }}>
              <Volume2 size={16} /> Test Sound
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                api.logout();
                navigate('/login');
              }} 
              style={{ backgroundColor: '#f43f5e', border: 'none', color: '#fff' }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid Split */}
      <main className="pos-grid-container" style={{ flex: 1, overflow: 'hidden' }}>
        
        {/* Left Section: Live Table Map */}
        <section className={`pos-section-tables ${activeTab === 'tables' ? 'active' : ''}`} style={{ borderRight: '1px solid #334155', padding: '1.5rem', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={18} style={{ color: 'hsl(var(--primary))' }} /> Table Layout Map
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              {tables.length} Tables Configured
            </span>
          </div>
 
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '1rem' }}>
            {tables.map(table => {
              const activeKOTs = getTableActiveOrders(table._id);
              const hasOrder = activeKOTs.length > 0;
              const styleDetails = getTableStatusLabel(table.status);
              
              return (
                <div 
                  key={table._id}
                  onClick={() => {
                    setSelectedTable(table);
                    setActiveTab('inspector');
                  }}
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.25rem 1rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    border: '2px solid',
                    boxShadow: selectedTable?._id === table._id ? '0 0 0 2px hsl(var(--primary)), var(--shadow-md)' : 'var(--shadow-sm)'
                  }}
                  className={`${getStatusColorClass(table.status)}`}
                >
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '4px' }}>{table.tableNumber}</h3>
                  <span className={`badge ${styleDetails.bg}`} style={{ fontSize: '0.7rem' }}>
                    {styleDetails.text}
                  </span>
                  
                  {table.activeCart?.length > 0 && (
                    <div style={{ fontSize: '0.7rem', marginTop: '6px', color: '#b45309', fontWeight: '600' }}>
                      🛒 {table.activeCart.reduce((sum, item) => sum + item.quantity, 0)} items
                    </div>
                  )}
 
                  {hasOrder && (
                    <div style={{ fontSize: '0.7rem', marginTop: '6px', color: '#be123c', fontWeight: '700' }}>
                      🔥 KOT ({activeKOTs[0].status})
                    </div>
                  )}
                </div>
              );
            })}
          </div>
 
          {/* Quick Status Legend */}
          <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#1e293b', borderRadius: 'var(--radius-md)', border: '1px solid #334155' }}>
            <h4 style={{ fontSize: '0.85rem', marginBottom: '0.75rem', color: '#94a3b8' }}>Table Status Legend</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '4px', backgroundColor: '#334155', display: 'inline-block' }}></span>
                <span>Vacant</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '4px', backgroundColor: 'rgba(245, 158, 11, 0.2)', border: '1px solid #f59e0b', display: 'inline-block' }}></span>
                <span>Customer Carting</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '4px', backgroundColor: 'rgba(225, 29, 72, 0.2)', border: '1px solid #e11d48', display: 'inline-block' }}></span>
                <span>KOT Sent (Unprepared)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '4px', backgroundColor: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981', display: 'inline-block' }}></span>
                <span>Billed (Served/Unpaid)</span>
              </div>
            </div>
          </div>
        </section>
 
        {/* Center Section: Active Kitchen Tickets (KOT) */}
        <section className={`pos-section-kot ${activeTab === 'kot' ? 'active' : ''}`} style={{ borderRight: '1px solid #334155', padding: '1.5rem', overflowY: 'auto' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={18} style={{ color: '#f59e0b' }} /> Live Kitchen Tickets ({orders.length})
          </h2>
 
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {orders.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '3rem 1rem' }}>
                <CheckCircle size={40} style={{ color: '#10b981', marginBottom: '0.75rem' }} />
                <h4>All clear!</h4>
                <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>No active dine-in orders pending.</p>
              </div>
            ) : (
              orders.map(order => (
                <div 
                  key={order._id}
                  style={{
                    backgroundColor: '#1e293b',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid',
                    borderColor: order.status === 'pending' ? '#f43f5e' : order.status === 'preparing' ? '#f59e0b' : '#334155',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  {/* KOT Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '0.5rem' }}>
                    <div>
                      <h4 style={{ fontSize: '1.05rem', color: '#fff' }}>
                        {order.tableId?.tableNumber || 'Table --'}
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                          {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        {order.mobileNumber && (
                          <span style={{ fontSize: '0.7rem', color: '#fb923c', fontWeight: '500' }}>
                            📞 {order.mobileNumber}
                          </span>
                        )}
                      </div>
                    </div>
 
                    <span className={`badge ${
                      order.status === 'pending' ? 'badge-danger' : order.status === 'preparing' ? 'badge-warning' : 'badge-success'
                    }`} style={{ fontSize: '0.7rem' }}>
                      {order.status === 'pending' ? 'PENDING CHEF' : order.status === 'preparing' ? 'PREPARING' : 'SERVED'}
                    </span>
                  </div>
 
                  {/* KOT Items */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                    {order.items.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <span style={{ fontWeight: '700', color: 'hsl(var(--primary))', marginRight: '6px' }}>{item.quantity}x</span>
                          <span style={{ fontWeight: '500', color: '#e2e8f0' }}>{item.name}</span>
                          {item.selectedOptions?.length > 0 && (
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', paddingLeft: '22px' }}>
                              {item.selectedOptions.map(o => o.choiceName).join(', ')}
                            </div>
                          )}
                          {item.instructions && (
                            <div style={{ fontSize: '0.7rem', color: '#f43f5e', paddingLeft: '22px', fontStyle: 'italic' }}>
                              ⚠️ Note: "{item.instructions}"
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
 
                  {/* Action Controllers */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid #334155', paddingTop: '0.75rem' }}>
                    {order.status === 'pending' && (
                      <button 
                        className="btn btn-primary"
                        onClick={() => handleUpdateStatus(order._id, 'preparing')}
                        style={{ width: '100%', fontSize: '0.8rem', padding: '6px 12px' }}
                      >
                        Accept & Start Cooking
                      </button>
                    )}
                    {order.status === 'preparing' && (
                      <button 
                        className="btn btn-primary"
                        onClick={() => handleUpdateStatus(order._id, 'served')}
                        style={{ width: '100%', backgroundColor: '#10b981', color: '#fff', fontSize: '0.8rem', padding: '6px 12px' }}
                      >
                        Mark Served (KOT Ready)
                      </button>
                    )}
                    {order.status === 'served' && (
                      <div style={{ width: '100%', textAlign: 'center', color: '#10b981', fontSize: '0.8rem', fontWeight: '600', padding: '4px' }}>
                        ✓ Food Served
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
 
        {/* Right Section: Focus Table Inspector & Bills */}
        <section className={`pos-section-inspector ${activeTab === 'inspector' ? 'active' : ''}`} style={{ padding: '1.5rem', overflowY: 'auto', backgroundColor: '#1e293b' }}>
          {selectedTable ? (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%' }}>
              
              {/* Head Inspector */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '0.75rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.3rem' }}>{selectedTable.tableNumber} Detail</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <span className={`badge ${getTableStatusLabel(selectedTable.status).bg}`} style={{ fontSize: '0.7rem' }}>
                      {getTableStatusLabel(selectedTable.status).text}
                    </span>
                    {selectedTable.verifiedMobileNumber && (
                      <span style={{ fontSize: '0.7rem', color: '#fb923c', fontWeight: '600' }}>
                        📞 Verified: {selectedTable.verifiedMobileNumber}
                      </span>
                    )}
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedTable(null)} 
                  style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  Close
                </button>
              </div>
 
              {/* Live Customer Cart Synchronization state */}
              {selectedTable.status === 'occupied' && selectedTable.activeCart?.length > 0 && (
                <div style={{ border: '1px dashed #f59e0b', borderRadius: 'var(--radius-md)', padding: '1rem', backgroundColor: 'rgba(245, 158, 11, 0.05)' }}>
                  <h3 style={{ fontSize: '0.9rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '0.5rem' }}>
                    <ShoppingCart size={14} /> Shared Cart Syncing (Active)
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                    {selectedTable.activeCart.map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{item.quantity}x {item.name}</span>
                        <span>₹{item.price * item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
 
              {/* Active bills summary */}
              {getTableActiveOrders(selectedTable._id).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', borderBottom: '1px solid #334155', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <DollarSign size={16} style={{ color: '#10b981' }} /> Running Session Bill
                    </h3>
 
                    {/* Order summary */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                      {getTableActiveOrders(selectedTable._id).map((order) => 
                        order.items.map((item, idx) => {
                          const optCost = item.selectedOptions?.reduce((a, b) => a + b.priceAdjustment, 0) || 0;
                          return (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{item.quantity}x {item.name}</span>
                              <span style={{ fontWeight: '600' }}>₹{(item.price + optCost) * item.quantity}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
 
                    {/* Totals */}
                    {getTableActiveOrders(selectedTable._id).map((order, idx) => (
                      <div key={idx} style={{ borderTop: '1px solid #334155', marginTop: '1rem', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Subtotal</span>
                          <span>₹{order.subtotal}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Tax (GST 5%)</span>
                          <span>₹{order.tax}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: '800', color: '#fff', borderTop: '1px dashed #334155', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                          <span>Total Amount</span>
                          <span style={{ color: '#10b981' }}>₹{order.total}</span>
                        </div>
                      </div>
                    ))}
                  </div>
 
                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button 
                      className="btn btn-primary"
                      onClick={() => handleClearTable(selectedTable._id)}
                      style={{ width: '100%', backgroundColor: '#10b981', color: '#fff', padding: '0.85rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }}
                    >
                      <CheckCircle size={16} /> Mark Paid & Clear Table
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#94a3b8', border: '1px dashed #334155', borderRadius: 'var(--radius-lg)' }}>
                  <AlertCircle size={28} style={{ color: '#64748b', marginBottom: '0.5rem' }} />
                  <h4>No Active Orders</h4>
                  <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>No items ordered during this session yet.</p>
                  
                  {selectedTable.status !== 'vacant' && (
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => handleClearTable(selectedTable._id)}
                      style={{ fontSize: '0.75rem', marginTop: '1rem', backgroundColor: '#334155', color: '#fff', border: 'none' }}
                    >
                      Reset Table Status
                    </button>
                  )}
                </div>
              )}
 
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#64748b', textAlign: 'center', padding: '1rem' }}>
              <Shield size={48} style={{ marginBottom: '1rem' }} />
              <h3>Table Inspector</h3>
              <p style={{ fontSize: '0.8rem', marginTop: '4px', maxWidth: '200px' }}>Select any table on the layout to view detailed bill and active cart.</p>
            </div>
          )}
        </section>
 
      </main>

      {/* Mobile Footer Tab Bar */}
      <div className="pos-mobile-footer">
        <button 
          onClick={() => setActiveTab('tables')} 
          className={`pos-footer-tab ${activeTab === 'tables' ? 'active' : ''}`}
          style={{ color: activeTab === 'tables' ? (restaurant?.themeColor || '#e11d48') : '#94a3b8' }}
        >
          <Layers size={20} />
          <span>Tables</span>
        </button>
        <button 
          onClick={() => setActiveTab('kot')} 
          className={`pos-footer-tab ${activeTab === 'kot' ? 'active' : ''}`}
          style={{ color: activeTab === 'kot' ? (restaurant?.themeColor || '#fb923c') : '#94a3b8' }}
        >
          <Users size={20} />
          <span>Kitchen ({orders.length})</span>
        </button>
        <button 
          onClick={() => setActiveTab('inspector')} 
          className={`pos-footer-tab ${activeTab === 'inspector' ? 'active' : ''}`}
          style={{ color: activeTab === 'inspector' ? (restaurant?.themeColor || '#10b981') : '#94a3b8' }}
        >
          <Shield size={20} />
          <span>Inspector {selectedTable ? `(${selectedTable.tableNumber})` : ''}</span>
        </button>
      </div>
    </div>
  );
}
