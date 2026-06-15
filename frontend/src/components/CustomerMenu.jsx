import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api, getSocket } from '../api';
import { 
  ShoppingBag, Search, Plus, Minus, X, Check, Clock, Utensils, Award, Users, FileText, ChevronRight
} from 'lucide-react';
import { auth } from '../firebase-config';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

export default function CustomerMenu() {
  const [restaurant, setRestaurant] = useState(null);
  const [menu, setMenu] = useState([]);
  const [table, setTable] = useState(null);
  
  // App UI State
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  
  // Customization Modal State
  const [customizingItem, setCustomizingItem] = useState(null);
  const [selectedChoices, setSelectedChoices] = useState({}); // { "Size": "Medium", "Crust": "Cheese Burst" }
  const [instructions, setInstructions] = useState('');

  // Order state (if table is ordered or billed)
  const [activeOrder, setActiveOrder] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Mobile Verification State
  const [verifiedMobileNumber, setVerifiedMobileNumber] = useState(null);
  const [mobileInput, setMobileInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [isUsingSimulator, setIsUsingSimulator] = useState(false);

  const params = useParams();
  const tableId = params.tableId;

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

  // Initialize REST data
  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setLoading(true);
        const resolvedSlug = getSlug();
        api.saveTenantSlug(resolvedSlug); // Save fallback slug in sessionStorage

        // 1. Fetch Restaurant details & tables list scoped via Header
        const tenantData = await api.getRestaurantInfo();
        const restObj = tenantData.restaurant;
        const tablesList = tenantData.tables || [];
        
        if (active) setRestaurant(restObj);

        // 2. Fetch Menu categories & items scoped via Header
        const menuData = await api.getMenu();
        if (active) setMenu(menuData);

        // 3. Resolve and Fetch Table Details
        if (!tableId) {
          if (active) setError('Please scan a Table QR code to browse the menu.');
          setLoading(false);
          return;
        }

        // Match table by ObjectId or Table Number name (e.g. "Table 1")
        const matchedTable = tablesList.find(t => 
          t._id === tableId || 
          t.tableNumber.toLowerCase() === tableId.toLowerCase() ||
          t.tableNumber.toLowerCase() === `table ${tableId}`.toLowerCase()
        );

        if (!matchedTable) {
          if (active) setError(`Dining Table '${tableId}' was not found for this cafe.`);
          setLoading(false);
          return;
        }

        const tableData = await api.getTable(matchedTable._id);
        if (active) {
          setTable(tableData.table);
          setCart(tableData.table.activeCart || []);
          setVerifiedMobileNumber(tableData.table.verifiedMobileNumber);
          setActiveOrder(tableData.activeOrder);
        }
      } catch (err) {
        console.error(err);
        if (active) setError('Could not load restaurant menu. Please check your QR code.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [tableId, params.restaurantSlug]);

  // Setup Socket connection when database ObjectIds are resolved
  useEffect(() => {
    if (!restaurant?._id || !table?._id) return;

    const socket = getSocket();
    socket.connect();
    
    setIsConnected(socket.connected);

    socket.emit('join_table', { 
      restaurantId: restaurant._id, 
      tableId: table._id 
    });

    const handleConnect = () => {
      setIsConnected(true);
      socket.emit('join_table', { 
        restaurantId: restaurant._id, 
        tableId: table._id 
      });
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleCartSync = (data) => {
      setCart(data.activeCart);
      setVerifiedMobileNumber(data.verifiedMobileNumber);
      setTable(prev => prev ? { ...prev, status: data.status, verifiedMobileNumber: data.verifiedMobileNumber } : null);
    };

    const handleOrderPlaced = (data) => {
      setCart(data.activeCart);
      setVerifiedMobileNumber(data.verifiedMobileNumber);
      setTable(prev => prev ? { ...prev, status: data.tableStatus, verifiedMobileNumber: data.verifiedMobileNumber } : null);
      api.getTable(restaurant._id, table._id).then((tableData) => {
        if (tableData.activeOrder) {
          setActiveOrder(tableData.activeOrder);
        }
      });
    };

    const handleOrderStatusChange = (data) => {
      setActiveOrder(prev => prev && prev._id === data.orderId ? { ...prev, status: data.status } : prev);
    };

    const handleTableCleared = (data) => {
      setCart(data.activeCart);
      setVerifiedMobileNumber(null);
      setTable(prev => prev ? { ...prev, status: data.status, verifiedMobileNumber: null } : null);
      setActiveOrder(null);
      localStorage.removeItem('verifiedMobileNumber');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('cart_sync', handleCartSync);
    socket.on('order_placed', handleOrderPlaced);
    socket.on('order_status_change', handleOrderStatusChange);
    socket.on('table_cleared', handleTableCleared);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('cart_sync', handleCartSync);
      socket.off('order_placed', handleOrderPlaced);
      socket.off('order_status_change', handleOrderStatusChange);
      socket.off('table_cleared', handleTableCleared);
    };
  }, [restaurant?._id, table?._id]);

  // Clean up Recaptcha Verifier on unmount
  useEffect(() => {
    return () => {
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
    };
  }, []);

  // Sync cart edits with server socket so others see it instantly
  const syncCartWithSocket = (newCart) => {
    if (!restaurant?._id || !table?._id) return;
    const socket = getSocket();
    socket.emit('update_cart', {
      restaurantId: restaurant._id,
      tableId: table._id,
      cartItems: newCart
    });
  };

  const handleAddToCartClick = (item) => {
    if (item.options && item.options.length > 0) {
      // Open Customization Modal
      setCustomizingItem(item);
      const defaults = {};
      item.options.forEach(opt => {
        if (opt.choices && opt.choices.length > 0) {
          defaults[opt.name] = opt.choices[0]; // Set default choice object
        }
      });
      setSelectedChoices(defaults);
      setInstructions('');
    } else {
      // Add directly to cart
      addOrUpdateCart(item, [], '');
    }
  };

  const addOrUpdateCart = (item, selectedOptsList, notes) => {
    let updatedCart = [...cart];
    
    // Check if item with exact same configurations already exists in cart
    const existingIndex = updatedCart.findIndex(cartItem => {
      if (cartItem.menuItemId !== item._id) return false;
      if (cartItem.instructions !== notes) return false;
      if (cartItem.selectedOptions.length !== selectedOptsList.length) return false;
      
      // Compare selections
      return cartItem.selectedOptions.every(opt => {
        const matching = selectedOptsList.find(
          o => o.optionName === opt.optionName && o.choiceName === opt.choiceName
        );
        return !!matching;
      });
    });

    if (existingIndex > -1) {
      updatedCart[existingIndex].quantity += 1;
    } else {
      // Add new item
      updatedCart.push({
        menuItemId: item._id,
        name: item.name,
        quantity: 1,
        price: item.price,
        selectedOptions: selectedOptsList,
        instructions: notes
      });
    }

    setCart(updatedCart);
    syncCartWithSocket(updatedCart);
    setCustomizingItem(null);
  };

  const updateQuantity = (itemIndex, change) => {
    let updatedCart = [...cart];
    const item = updatedCart[itemIndex];
    item.quantity += change;

    if (item.quantity <= 0) {
      updatedCart.splice(itemIndex, 1);
    }

    setCart(updatedCart);
    syncCartWithSocket(updatedCart);
  };

  const getCustomizedItemPrice = () => {
    if (!customizingItem) return 0;
    let price = customizingItem.price;
    Object.values(selectedChoices).forEach(choice => {
      price += choice.priceAdjustment || 0;
    });
    return price;
  };

  const getCartSubtotal = () => {
    return cart.reduce((total, item) => {
      const optionsCost = item.selectedOptions.reduce((acc, opt) => acc + opt.priceAdjustment, 0);
      return total + (item.price + optionsCost) * item.quantity;
    }, 0);
  };

  const handlePlaceOrder = async () => {
    // If table session is already verified, submit directly with that number
    if (verifiedMobileNumber) {
      submitOrder(verifiedMobileNumber);
    } else {
      // Check if user has their own verified number in cache
      const storedMobile = localStorage.getItem('verifiedMobileNumber');
      if (storedMobile) {
        setMobileInput(storedMobile);
      }
      setIsVerifying(true);
      setIsCartOpen(false); // Close cart drawer to focus on OTP
    }
  };

  const submitOrder = async (phone, otpCode = null) => {
    try {
      setLoading(true);
      const subtotal = getCartSubtotal();
      const tax = parseFloat((subtotal * 0.05).toFixed(2));
      const grandTotal = parseFloat((subtotal + tax).toFixed(2));

      const orderPayload = {
        tableId,
        items: cart,
        mobileNumber: phone,
        otp: otpCode,
        subtotal,
        tax,
        total: grandTotal
      };

      const placedOrder = await api.placeOrder(orderPayload);
      setActiveOrder(placedOrder);
      setCart([]);
      setIsCartOpen(false);
      setIsVerifying(false);
      setOtpSent(false);
      setVerifiedMobileNumber(phone);
      localStorage.setItem('verifiedMobileNumber', phone);

      if (table) {
        setTable({ 
          ...table, 
          status: 'ordered', 
          verifiedMobileNumber: phone 
        });
      }
    } catch (err) {
      alert(err.message || 'Failed to place order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!mobileInput || mobileInput.length < 10) {
      alert('Please enter a valid 10-digit mobile number.');
      return;
    }
    try {
      setOtpLoading(true);
      
      // Initialize reCAPTCHA verifier lazily if not created yet
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
          callback: () => {
            // reCAPTCHA solved
          }
        });
      }

      const appVerifier = window.recaptchaVerifier;
      const formattedPhone = mobileInput.startsWith('+') ? mobileInput : `+91${mobileInput}`;
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      setConfirmationResult(confirmation);
      setIsUsingSimulator(false);
      setOtpSent(true);
      alert('Verification code sent to your phone!');
    } catch (err) {
      console.warn('Firebase Auth Error: Failed to send via Firebase. Falling back to backend handler...', err);
      try {
        const data = await api.sendOtp(mobileInput);
        setConfirmationResult(null);
        setIsUsingSimulator(true);
        setOtpSent(true);
        if (data.sentRealSms) {
          alert('Verification code sent to your phone via SMS!');
        } else {
          alert(`[Simulation Mode] Verification code sent! Your simulated OTP is: ${data.otp}\n\n(Firebase error: ${err.message || err})`);
        }
      } catch (simErr) {
        console.error('Simulator Error:', simErr);
        alert(simErr.message || 'Failed to send OTP code.');
        if (window.recaptchaVerifier) {
          window.recaptchaVerifier.render().then((widgetId) => {
            if (window.grecaptcha) window.grecaptcha.reset(widgetId);
          });
        }
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyAndPlaceOrder = async () => {
    if (!otpInput || otpInput.length < 6) {
      alert('Please enter the 6-digit verification code.');
      return;
    }
    try {
      setLoading(true);
      if (isUsingSimulator) {
        // Direct submit with simulated code
        await submitOrder(mobileInput, otpInput);
      } else {
        const result = await confirmationResult.confirm(otpInput);
        const user = result.user;
        const idToken = await user.getIdToken();
        await submitOrder(user.phoneNumber, idToken);
      }
    } catch (err) {
      alert('Invalid verification code. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Filter items based on Category tab and Search query
  const filteredMenu = menu.map(category => {
    // Check if category matches tab selection
    if (selectedCategory !== 'all' && category._id !== selectedCategory) {
      return null;
    }

    // Filter items inside category by search query
    const items = category.items.filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (items.length === 0) return null;

    return {
      ...category,
      items
    };
  }).filter(Boolean);

  if (loading && !restaurant) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
        <div className="animate-pulse-glow" style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '24px', fontWeight: 'bold' }}>🍕</div>
        <div style={{ fontWeight: '600', color: 'hsl(var(--text-muted))' }}>Loading digital menu...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', gap: '1.5rem', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '64px' }}>⚠️</div>
        <h3 style={{ color: 'hsl(var(--danger))' }}>Access Denied</h3>
        <p style={{ color: 'hsl(var(--text-muted))', maxWidth: '300px' }}>{error}</p>
        <button className="btn btn-secondary" onClick={() => window.location.reload()}>Try Again</button>
      </div>
    );
  }

  const isTableActive = table?.status === 'ordered' || table?.status === 'billed';

  return (
    <div className="mobile-container">
      {/* Top Header */}
      <header className="glassmorphism" style={{ position: 'sticky', top: 0, zIndex: 50, padding: '1rem', borderBottom: '1px solid hsl(var(--border))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '2rem' }}>{restaurant?.logo || '🍕'}</span>
            <div>
              <h3 style={{ fontSize: '1.15rem', color: 'hsl(var(--text-main))' }}>{restaurant?.name}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="badge badge-muted" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                  {table?.tableNumber || 'Table --'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: isConnected ? 'hsl(var(--success))' : 'hsl(var(--danger))' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isConnected ? 'hsl(var(--success))' : 'hsl(var(--danger))', display: 'inline-block' }}></span>
                  {isConnected ? 'Sync Active' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
          
          {/* Multiplayer indicator */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'hsl(var(--text-muted))', fontSize: '0.8rem', backgroundColor: 'hsl(var(--border) / 0.5)', padding: '4px 8px', borderRadius: 'var(--radius-md)' }}>
              <Users size={14} />
              <span style={{ fontWeight: '600' }}>Multiplayer</span>
            </div>
            {verifiedMobileNumber && (
              <span style={{ fontSize: '0.68rem', color: 'hsl(var(--success))', fontWeight: '700' }}>
                📞 Session: +91 ******{verifiedMobileNumber.slice(-4)}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* --- Live Order Tracker View --- */}
      {isTableActive && activeOrder ? (
        <div className="animate-fade-in" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1 }}>
          <div className="glassmorphism animate-scale-up" style={{ padding: '1.5rem', borderRadius: 'var(--radius-lg)', textAlign: 'center', boxShadow: 'var(--shadow-lg)', border: '1px solid hsl(var(--primary) / 0.1)' }}>
            <div className="animate-float" style={{ display: 'inline-flex', padding: '1rem', backgroundColor: 'hsl(var(--primary-light))', borderRadius: 'var(--radius-full)', color: 'hsl(var(--primary))', marginBottom: '1rem' }}>
              <Utensils size={32} />
            </div>
            
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Order Placed!</h2>
            <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.85rem' }}>Your order is sent straight to the chef</p>
            
            {/* Status Steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem', textAlign: 'left' }}>
              
              {/* Step 1: Pending */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ 
                  width: '28px', height: '28px', borderRadius: '50%', 
                  backgroundColor: ['pending', 'preparing', 'served'].includes(activeOrder.status) ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' 
                }}>
                  {['preparing', 'served'].includes(activeOrder.status) ? <Check size={14} /> : <Clock size={14} />}
                </div>
                <div>
                  <h4 style={{ fontSize: '0.95rem', color: activeOrder.status === 'pending' ? 'hsl(var(--text-main))' : 'hsl(var(--text-muted))' }}>
                    Order Confirmed
                  </h4>
                  <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>Waiting for kitchen acceptance</p>
                </div>
              </div>

              {/* Step 2: Preparing */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ 
                  width: '28px', height: '28px', borderRadius: '50%', 
                  backgroundColor: ['preparing', 'served'].includes(activeOrder.status) ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' 
                }}>
                  {activeOrder.status === 'served' ? <Check size={14} /> : <Utensils size={14} />}
                </div>
                <div>
                  <h4 style={{ fontSize: '0.95rem', color: activeOrder.status === 'preparing' ? 'hsl(var(--text-main))' : 'hsl(var(--text-muted))' }}>
                    Cooking in Kitchen
                  </h4>
                  <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>Our chef is preparing your fresh meal</p>
                </div>
              </div>

              {/* Step 3: Served */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ 
                  width: '28px', height: '28px', borderRadius: '50%', 
                  backgroundColor: activeOrder.status === 'served' ? 'hsl(var(--success))' : 'hsl(var(--border))',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' 
                }}>
                  <Check size={14} />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.95rem', color: activeOrder.status === 'served' ? 'hsl(var(--success))' : 'hsl(var(--text-muted))' }}>
                    Served & Enjoy
                  </h4>
                  <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>Food has been delivered to your table</p>
                </div>
              </div>

            </div>

            {/* If table status is billed */}
            {table?.status === 'billed' && (
              <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: 'hsl(var(--success) / 0.1)', color: 'hsl(var(--success))', borderRadius: 'var(--radius-md)', fontWeight: '600', fontSize: '0.9rem' }}>
                💳 Please complete the payment at the cashier counter. Thank you!
              </div>
            )}
          </div>

          {/* Running Bill Details */}
          <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius-lg)', padding: '1.25rem', backgroundColor: 'hsl(var(--surface))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
              <FileText size={18} style={{ color: 'hsl(var(--primary))' }} />
              <h3 style={{ fontSize: '1.1rem' }}>Running KOT Summary</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {activeOrder.items?.map((item, idx) => {
                const optCost = item.selectedOptions?.reduce((a, b) => a + b.priceAdjustment, 0) || 0;
                return (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <div>
                      <div style={{ fontWeight: '500' }}>
                        {item.quantity} x {item.name}
                      </div>
                      {item.selectedOptions?.length > 0 && (
                        <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>
                          {item.selectedOptions.map(o => `${o.optionName}: ${o.choiceName}`).join(', ')}
                        </div>
                      )}
                    </div>
                    <div style={{ fontWeight: '600', color: 'hsl(var(--text-main))' }}>
                      ₹{(item.price + optCost) * item.quantity}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: '1px solid hsl(var(--border))', marginTop: '1rem', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal</span>
                <span>₹{activeOrder.subtotal}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>GST (5%)</span>
                <span>₹{activeOrder.tax}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: '800', color: 'hsl(var(--text-main))', borderTop: '1px dashed hsl(var(--border))', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                <span>Total Amount</span>
                <span>₹{activeOrder.total}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* --- Normal Digital Menu Catalog --- */
        <div style={{ flex: 1, paddingBottom: '90px' }}>
          
          {/* Search bar */}
          <div style={{ padding: '1rem 1rem 0.5rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius-full)', padding: '0.25rem 0.75rem 0.25rem 1rem', boxShadow: 'var(--shadow-sm)' }}>
              <Search size={18} style={{ color: 'hsl(var(--text-muted))', marginRight: '0.5rem' }} />
              <input 
                type="text" 
                placeholder="Search delicious food..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ border: 'none', background: 'none', width: '100%', padding: '0.5rem 0', color: 'hsl(var(--text-main))' }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer' }}>
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Categories Tab Bar */}
          <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0.5rem 1rem 1rem 1rem', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            <button 
              onClick={() => setSelectedCategory('all')}
              style={{
                whiteSpace: 'nowrap',
                padding: '0.5rem 1.25rem',
                borderRadius: 'var(--radius-full)',
                fontWeight: '600',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: selectedCategory === 'all' ? 'hsl(var(--primary))' : 'hsl(var(--surface))',
                color: selectedCategory === 'all' ? '#fff' : 'hsl(var(--text-muted))',
                boxShadow: 'var(--shadow-sm)',
                transition: 'all var(--transition-fast)'
              }}
            >
              All Items
            </button>
            {menu.map(cat => (
              <button 
                key={cat._id}
                onClick={() => setSelectedCategory(cat._id)}
                style={{
                  whiteSpace: 'nowrap',
                  padding: '0.5rem 1.25rem',
                  borderRadius: 'var(--radius-full)',
                  fontWeight: '600',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: selectedCategory === cat._id ? 'hsl(var(--primary))' : 'hsl(var(--surface))',
                  color: selectedCategory === cat._id ? '#fff' : 'hsl(var(--text-muted))',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'all var(--transition-fast)'
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Menu Items Grid */}
          <div style={{ padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {filteredMenu.map(category => (
              <div key={category._id} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h3 style={{ fontSize: '1.25rem', borderLeft: '4px solid hsl(var(--primary))', paddingLeft: '0.5rem', color: 'hsl(var(--text-main))' }}>
                  {category.name}
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {category.items.map(item => {
                    // Check if item is in cart
                    const cartQty = cart
                      .filter(c => c.menuItemId === item._id)
                      .reduce((sum, c) => sum + c.quantity, 0);

                    return (
                      <div 
                        key={item._id} 
                        style={{
                          display: 'flex',
                          gap: '1rem',
                          backgroundColor: 'hsl(var(--surface))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 'var(--radius-lg)',
                          padding: '0.75rem',
                          boxShadow: 'var(--shadow-sm)',
                          alignItems: 'center'
                        }}
                      >
                        {/* Item image */}
                        {item.image && (
                          <img 
                            src={item.image} 
                            alt={item.name} 
                            style={{ width: '85px', height: '85px', objectFit: 'cover', borderRadius: 'var(--radius-md)' }}
                          />
                        )}

                        {/* Item details */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'hsl(var(--text-main))' }}>{item.name}</h4>
                          <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {item.description}
                          </p>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                            <span style={{ fontSize: '1.05rem', fontWeight: '800', color: 'hsl(var(--text-main))' }}>₹{item.price}</span>
                            
                            {/* Add Button */}
                            {cartQty > 0 ? (
                              <div className="quantity-control">
                                <span style={{ padding: '0 10px', fontSize: '0.85rem', fontWeight: '700' }}>In Cart ({cartQty})</span>
                                <button onClick={() => handleAddToCartClick(item)} style={{ width: '28px', height: '28px' }}>
                                  <Plus size={14} />
                                </button>
                              </div>
                            ) : (
                              <button 
                                className="btn btn-secondary"
                                onClick={() => handleAddToCartClick(item)}
                                style={{
                                  padding: '0.35rem 1rem',
                                  fontSize: '0.85rem',
                                  borderRadius: 'var(--radius-full)',
                                  borderColor: 'hsl(var(--primary) / 0.3)',
                                  color: 'hsl(var(--primary))',
                                  backgroundColor: 'hsl(var(--primary-light))'
                                }}
                              >
                                <Plus size={14} style={{ marginRight: '2px' }} /> Add
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Floating Cart Panel (Bottom) */}
          {cart.length > 0 && (
            <div className="bottom-nav animate-slide-up">
              <div 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  backgroundColor: 'hsl(var(--primary))', 
                  color: '#fff', 
                  padding: '0.85rem 1.25rem', 
                  borderRadius: 'var(--radius-lg)', 
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-lg)',
                  animation: 'pulseGlow 2s infinite'
                }}
                onClick={() => setIsCartOpen(true)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShoppingBag size={20} />
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>
                      {cart.reduce((sum, item) => sum + item.quantity, 0)} {cart.reduce((sum, item) => sum + item.quantity, 0) === 1 ? 'item' : 'items'}
                    </div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>Shared Table Cart</div>
                  </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: '700' }}>
                  <span>View Drawer (₹{getCartSubtotal()})</span>
                  <ChevronRight size={16} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- CUSTOMIZATION DIALOG / DRAWER --- */}
      {customizingItem && (
        <div className="custom-modal-backdrop" onClick={() => setCustomizingItem(null)}>
          <div className="custom-modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>Customize {customizingItem.name}</h3>
                <span style={{ fontSize: '1.1rem', fontWeight: '800', color: 'hsl(var(--primary))' }}>
                  ₹{getCustomizedItemPrice()}
                </span>
              </div>
              <button 
                onClick={() => setCustomizingItem(null)}
                style={{ background: 'hsl(var(--border) / 0.5)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Options selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', margin: '1rem 0' }}>
              {customizingItem.options.map((option) => (
                <div key={option.name} style={{ borderBottom: '1px solid hsl(var(--border))', paddingBottom: '1rem' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '0.75rem', color: 'hsl(var(--text-main))' }}>
                    Select {option.name}
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {option.choices.map((choice) => (
                      <label 
                        key={choice.name}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.65rem 0.85rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid',
                          borderColor: selectedChoices[option.name]?.name === choice.name ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                          backgroundColor: selectedChoices[option.name]?.name === choice.name ? 'hsl(var(--primary-light))' : 'transparent',
                          cursor: 'pointer',
                          fontSize: '0.9rem'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input 
                            type="radio" 
                            name={`opt-${option.name}`}
                            checked={selectedChoices[option.name]?.name === choice.name}
                            onChange={() => {
                              setSelectedChoices({
                                ...selectedChoices,
                                [option.name]: choice
                              });
                            }}
                            style={{ accentColor: 'hsl(var(--primary))' }}
                          />
                          <span style={{ fontWeight: selectedChoices[option.name]?.name === choice.name ? '600' : '400' }}>
                            {choice.name}
                          </span>
                        </div>
                        {choice.priceAdjustment > 0 && (
                          <span style={{ color: 'hsl(var(--text-muted))', fontSize: '0.85rem' }}>
                            +₹{choice.priceAdjustment}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {/* Cooking Instructions */}
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '0.5rem' }}>Special Instructions</h4>
                <textarea 
                  rows={2}
                  placeholder="E.g. Make it spicy, No onions, extra cheese..."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid hsl(var(--border))', resize: 'none' }}
                />
              </div>
            </div>

            {/* Confirm button */}
            <button 
              className="btn btn-primary"
              onClick={() => {
                const optList = Object.entries(selectedChoices).map(([name, choice]) => ({
                  optionName: name,
                  choiceName: choice.name,
                  priceAdjustment: choice.priceAdjustment
                }));
                addOrUpdateCart(customizingItem, optList, instructions);
              }}
              style={{ width: '100%', padding: '1rem', marginTop: '0.5rem', borderRadius: 'var(--radius-full)' }}
            >
              Add Custom Selection to Table Cart
            </button>
          </div>
        </div>
      )}

      {/* --- CART DRAWER OVERLAY --- */}
      {isCartOpen && (
        <div className="custom-modal-backdrop" onClick={() => setIsCartOpen(false)}>
          <div className="custom-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '80vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShoppingBag size={20} style={{ color: 'hsl(var(--primary))' }} />
                <h3 style={{ fontSize: '1.2rem' }}>Shared Table Cart</h3>
              </div>
              <button 
                onClick={() => setIsCartOpen(false)}
                style={{ background: 'none', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Cart Items List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', maxHeight: '40vh', paddingRight: '4px' }}>
              {cart.map((item, index) => {
                const optionsPrice = item.selectedOptions.reduce((acc, curr) => acc + curr.priceAdjustment, 0);
                const itemTotal = (item.price + optionsPrice) * item.quantity;
                return (
                  <div key={index} style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid hsl(var(--border) / 0.5)', paddingBottom: '0.75rem', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: '600' }}>{item.name}</h4>
                      {item.selectedOptions.length > 0 && (
                        <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginTop: '2px' }}>
                          {item.selectedOptions.map(o => `${o.optionName}: ${o.choiceName}`).join(', ')}
                        </div>
                      )}
                      {item.instructions && (
                        <div style={{ fontSize: '0.75rem', color: 'hsl(var(--primary))', fontStyle: 'italic', marginTop: '2px' }}>
                          " {item.instructions} "
                        </div>
                      )}
                      <div style={{ fontWeight: '700', fontSize: '0.95rem', marginTop: '4px', color: 'hsl(var(--text-main))' }}>
                        ₹{item.price + optionsPrice} <span style={{ fontSize: '0.8rem', fontWeight: '400', color: 'hsl(var(--text-muted))' }}>each</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                      <div className="quantity-control">
                        <button onClick={() => updateQuantity(index, -1)}>
                          <Minus size={14} />
                        </button>
                        <span>{item.quantity}</span>
                        <button onClick={() => updateQuantity(index, 1)}>
                          <Plus size={14} />
                        </button>
                      </div>
                      <span style={{ fontWeight: '800', fontSize: '0.95rem', color: 'hsl(var(--text-main))' }}>
                        ₹{itemTotal}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Calculations and Actions */}
            <div style={{ marginTop: '1.25rem', borderTop: '1px solid hsl(var(--border))', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem', color: 'hsl(var(--text-muted))', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal</span>
                  <span style={{ color: 'hsl(var(--text-main))', fontWeight: '500' }}>₹{getCartSubtotal()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>GST Tax (5%)</span>
                  <span style={{ color: 'hsl(var(--text-main))', fontWeight: '500' }}>₹{parseFloat((getCartSubtotal() * 0.05).toFixed(2))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: '800', color: 'hsl(var(--text-main))', borderTop: '1px dashed hsl(var(--border))', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                  <span>Grand Total</span>
                  <span>₹{parseFloat((getCartSubtotal() * 1.05).toFixed(2))}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setIsCartOpen(false)}
                  style={{ flex: 1, borderRadius: 'var(--radius-full)' }}
                >
                  Add Items
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handlePlaceOrder}
                  style={{ flex: 2, borderRadius: 'var(--radius-full)' }}
                >
                  Send to Kitchen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MOBILE VERIFICATION MODAL / DRAWER --- */}
      {isVerifying && (
        <div className="custom-modal-backdrop" onClick={() => setIsVerifying(false)}>
          <div className="custom-modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1.2rem' }}>Mobile Verification</h3>
              <button 
                onClick={() => {
                  setIsVerifying(false);
                  setOtpSent(false);
                  setOtpInput('');
                }}
                style={{ background: 'none', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {!otpSent ? (
              /* Step 1: Input mobile number */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>
                  Please verify your mobile number to place your order. This verification is required once per dine-in session.
                </p>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'hsl(var(--text-muted))', display: 'block', marginBottom: '0.5rem' }}>
                    Mobile Number
                  </label>
                  <div style={{ display: 'flex', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <span style={{ backgroundColor: 'hsl(var(--border) / 0.5)', padding: '0.75rem', fontWeight: '600', color: 'hsl(var(--text-muted))', borderRight: '1px solid hsl(var(--border))' }}>+91</span>
                    <input 
                      type="tel"
                      maxLength={10}
                      placeholder="Enter 10-digit number"
                      value={mobileInput}
                      onChange={(e) => setMobileInput(e.target.value.replace(/\D/g, ''))}
                      style={{ border: 'none', width: '100%', padding: '0.75rem', fontSize: '1rem', color: 'hsl(var(--text-main))' }}
                    />
                  </div>
                </div>

                <div style={{ padding: '0.75rem', backgroundColor: 'hsl(var(--warning) / 0.1)', color: 'hsl(var(--warning) / 0.9)', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', fontWeight: '600' }}>
                  💡 Verification is powered by Firebase Authentication.
                </div>

                <button 
                  className="btn btn-primary"
                  onClick={handleSendOtp}
                  disabled={otpLoading}
                  style={{ width: '100%', padding: '1rem', borderRadius: 'var(--radius-full)' }}
                >
                  {otpLoading ? 'Sending...' : 'Send Verification OTP'}
                </button>
              </div>
            ) : (
              /* Step 2: Input OTP */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>
                  We sent a 6-digit verification code to **+91 {mobileInput}**. Enter it below.
                </p>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'hsl(var(--text-muted))', display: 'block', marginBottom: '0.5rem' }}>
                    Verification Code (OTP)
                  </label>
                  <input 
                    type="text"
                    maxLength={6}
                    placeholder="Enter 6-digit code"
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                    style={{ 
                      width: '100%', 
                      padding: '0.75rem', 
                      borderRadius: 'var(--radius-md)', 
                      border: '1px solid hsl(var(--border))', 
                      fontSize: '1.25rem', 
                      textAlign: 'center', 
                      letterSpacing: '0.5em', 
                      fontWeight: '700',
                      color: 'hsl(var(--text-main))' 
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'hsl(var(--text-muted))' }}>Didn't receive code?</span>
                  <button 
                    onClick={handleSendOtp}
                    style={{ background: 'none', border: 'none', color: 'hsl(var(--primary))', fontWeight: '700', cursor: 'pointer' }}
                  >
                    Resend Code
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => {
                      setOtpSent(false);
                      setOtpInput('');
                    }}
                    style={{ flex: 1, borderRadius: 'var(--radius-full)' }}
                  >
                    Back
                  </button>
                  <button 
                    className="btn btn-primary"
                    onClick={handleVerifyAndPlaceOrder}
                    disabled={loading}
                    style={{ flex: 2, borderRadius: 'var(--radius-full)' }}
                  >
                    {loading ? 'Submitting...' : 'Verify & Place Order'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <div id="recaptcha-container"></div>
    </div>
  );
}
