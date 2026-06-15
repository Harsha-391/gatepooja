import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { 
  Plus, Edit, Trash2, Layout, BookOpen, Layers, PlusCircle, Check, HelpCircle, AlertCircle, RefreshCw, Smartphone, QrCode, ExternalLink, ArrowLeft, ToggleLeft, ToggleRight
} from 'lucide-react';
import { storage } from '../firebase-config';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

export default function CafeAdminDashboard() {
  const params = useParams();
  const navigate = useNavigate();
  
  // Scoped tenant states
  const [restaurant, setRestaurant] = useState(null);
  const [menu, setMenu] = useState([]); // Array of { categoryId, name, items: [...] }
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Tabs: 'menu' or 'tables'
  const [activeTab, setActiveTab] = useState('menu');

  // Tenant Resolution (URL path vs Subdomain)
  const [slug, setSlug] = useState('');

  // Form states for Category
  const [newCatName, setNewCatName] = useState('');

  // Form states for Tables
  const [newTableNumber, setNewTableNumber] = useState('');

  // QR Modal state
  const [selectedQrTable, setSelectedQrTable] = useState(null);

  // Form states for Menu Items
  const [editingItem, setEditingItem] = useState(null); // null means adding new
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemCategoryId, setItemCategoryId] = useState('');
  const [itemImage, setItemImage] = useState('');
  const [itemOptions, setItemOptions] = useState([]); // [{ name: "Size", choices: [{name: "Regular", priceAdjustment: 0}] }]
  
  // Upload States for Firebase Storage
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Temp option builder state
  const [optName, setOptName] = useState('');
  const [optChoicesString, setOptChoicesString] = useState(''); // "Regular:0, Large:100"

  // Detect slug from hostname or path & verify auth
  useEffect(() => {
    if (!api.isAuthenticated()) {
      navigate('/login', { state: { from: window.location.pathname } });
      return;
    }

    let resolvedSlug = '';
    const host = window.location.hostname;
    const parts = host.split('.');
    
    if (parts.length > 1 && parts[parts.length - 2] !== 'www') {
      // Subdomain scenario
      resolvedSlug = parts[0];
    } else if (params.restaurantSlug) {
      // Route path fallback scenario
      resolvedSlug = params.restaurantSlug;
    } else {
      // Default fallback
      resolvedSlug = 'bite-of-italy';
    }
    
    setSlug(resolvedSlug);
    loadTenantData(resolvedSlug);
  }, [params.restaurantSlug, navigate]);

  const loadTenantData = async (tenantSlug) => {
    try {
      setLoading(true);
      api.saveTenantSlug(tenantSlug);
      const data = await api.getRestaurantInfo();
      setRestaurant(data.restaurant);
      setTables(data.tables || []);
      
      // Fetch categorized menu scoped via header
      const menuData = await api.getMenu();
      setMenu(menuData);
    } catch (err) {
      console.error(err);
      setError('Could not load Cafe details. Please verify the URL.');
    } finally {
      setLoading(false);
    }
  };

  // --- Category Actions ---
  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCatName) return;
    try {
      await api.addCategory(newCatName);
      setNewCatName('');
      loadTenantData(slug);
    } catch (err) {
      alert('Failed to add category');
    }
  };

  const handleDeleteCategory = async (catId) => {
    if (!window.confirm('WARNING: Deleting this category will delete all items inside it. Continue?')) return;
    try {
      await api.deleteCategory(catId);
      loadTenantData(slug);
    } catch (err) {
      alert('Failed to delete category');
    }
  };

  // --- Table Actions ---
  const handleAddTable = async (e) => {
    e.preventDefault();
    if (!newTableNumber) return;
    try {
      await api.addTable(newTableNumber);
      setNewTableNumber('');
      loadTenantData(slug);
    } catch (err) {
      alert(err.message || 'Failed to add table');
    }
  };

  const handleDeleteTable = async (tableId) => {
    if (!window.confirm('Delete this table? This clears any active carts associated with it.')) return;
    try {
      await api.deleteTable(tableId);
      loadTenantData(slug);
    } catch (err) {
      alert('Failed to delete table');
    }
  };

  // --- Menu Item Form Builders ---
  const openAddItemForm = () => {
    setEditingItem(null);
    setItemName('');
    setItemDescription('');
    setItemPrice('');
    setItemCategoryId(menu[0]?._id || '');
    setItemImage('');
    setItemOptions([]);
    setOptName('');
    setOptChoicesString('');
    setIsFormOpen(true);
  };

  const openEditItemForm = (item) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemDescription(item.description);
    setItemPrice(item.price);
    setItemCategoryId(item.categoryId);
    setItemImage(item.image);
    setItemOptions(item.options || []);
    setOptName('');
    setOptChoicesString('');
    setIsFormOpen(true);
  };

  const handleAddOption = () => {
    if (!optName || !optChoicesString) {
      alert('Enter option name (e.g. Size) and choices (e.g. Regular:0, Large:100)');
      return;
    }
    
    // Parse choices: "Regular:0, Large:100" ➔ [{name: "Regular", priceAdjustment: 0}, ...]
    try {
      const choices = optChoicesString.split(',').map(choiceStr => {
        const parts = choiceStr.split(':');
        const name = parts[0].trim();
        const price = parts[1] ? Number(parts[1].trim()) : 0;
        if (!name) throw new Error('Invalid choice name');
        return { name, priceAdjustment: price };
      });

      setItemOptions([
        ...itemOptions,
        { name: optName, choices }
      ]);
      setOptName('');
      setOptChoicesString('');
    } catch (err) {
      alert('Invalid choice string format. Please use "Name:Price, Name:Price"');
    }
  };

  const handleRemoveOption = (index) => {
    setItemOptions(itemOptions.filter((_, idx) => idx !== index));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    const storageRef = ref(storage, `dishes/${Date.now()}-${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = Math.round(
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        );
        setUploadProgress(progress);
      },
      (error) => {
        console.error('Upload failed:', error);
        alert('Image upload failed: ' + error.message);
        setUploading(false);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setItemImage(downloadURL);
        } catch (err) {
          console.error('Failed to get download URL:', err);
        } finally {
          setUploading(false);
        }
      }
    );
  };

  const handleItemSubmit = async (e) => {
    e.preventDefault();
    if (!itemName || !itemPrice || !itemCategoryId) {
      alert('Item Name, Price, and Category are required.');
      return;
    }

    const payload = {
      name: itemName,
      description: itemDescription,
      price: Number(itemPrice),
      categoryId: itemCategoryId,
      image: itemImage,
      options: itemOptions
    };

    try {
      if (editingItem) {
        await api.editMenuItem(editingItem._id, payload);
      } else {
        await api.addMenuItem(payload);
      }
      setIsFormOpen(false);
      loadTenantData(slug);
    } catch (err) {
      alert('Failed to save menu item details.');
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('Delete this menu item?')) return;
    try {
      await api.deleteMenuItem(itemId);
      loadTenantData(slug);
    } catch (err) {
      alert('Failed to delete menu item');
    }
  };

  const handleToggleAvailability = async (item) => {
    try {
      const payload = {
        name: item.name,
        price: item.price,
        categoryId: item.categoryId,
        description: item.description,
        image: item.image,
        options: item.options,
        isAvailable: !item.isAvailable
      };
      await api.editMenuItem(item._id, payload);
      loadTenantData(slug);
    } catch (err) {
      alert('Failed to update availability status.');
    }
  };

  // --- Dynamic QR Code URL builder ---
  const getTableClientUrl = (tableId) => {
    const port = window.location.port ? `:${window.location.port}` : '';
    // Build subdomain or path fallback depending on configuration
    const isSubdomained = window.location.hostname.split('.').length > 1 && window.location.hostname.split('.')[window.location.hostname.split('.').length - 2] !== 'www';
    if (isSubdomained) {
      return `${window.location.protocol}//${slug}.localhost${port}/t/${tableId}`;
    }
    return `${window.location.protocol}//${window.location.hostname}${port}/r/${slug}/t/${tableId}`;
  };

  const getTableQrUrl = (tableId) => {
    const clientUrl = getTableClientUrl(tableId);
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(clientUrl)}`;
  };

  if (loading && !restaurant) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a', color: '#fff' }}>
        <RefreshCw className="animate-spin" size={42} style={{ color: '#e11d48' }} />
        <p style={{ marginTop: '1rem', color: '#94a3b8' }}>Loading Cafe Customizer...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', gap: '1.5rem', padding: '2rem', backgroundColor: '#0f172a', color: '#fff' }}>
        <div style={{ fontSize: '48px' }}>❌</div>
        <h3 style={{ color: '#f43f5e' }}>Customizer Error</h3>
        <p style={{ color: '#cbd5e1' }}>{error}</p>
        <Link to="/" className="btn btn-secondary" style={{ backgroundColor: '#334155', border: 'none', color: '#fff' }}>
          <ArrowLeft size={16} /> Return to Portal
        </Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', display: 'flex', flexDirection: 'column' }} className="dark-theme">
      {/* Top Banner Header */}
      <header style={{ borderBottom: '1px solid #334155', padding: '1rem 1.5rem', backgroundColor: '#1e293b' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '2.5rem' }}>{restaurant?.logo}</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '1.4rem', fontWeight: '800' }}>{restaurant?.name} Editor</h1>
                <span className="badge" style={{ backgroundColor: `${restaurant?.themeColor}15`, color: restaurant?.themeColor, fontSize: '0.7rem', border: `1px solid ${restaurant?.themeColor}40` }}>
                  SaaS Partner
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Manage categories, dishes, custom toppings, and dining QR tables.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={() => {
                api.logout();
                navigate('/login');
              }}
              className="btn btn-secondary" 
              style={{ backgroundColor: '#334155', border: 'none', color: '#fff', padding: '0.5rem 1rem', fontSize: '0.8rem' }}
            >
              Logout
            </button>
            <a 
              href={window.location.pathname.replace('/dashboard', '/admin')} 
              target="_blank" 
              rel="noreferrer"
              className="btn btn-primary" 
              style={{ backgroundColor: restaurant?.themeColor, color: '#fff', padding: '0.5rem 1rem', fontSize: '0.8rem' }}
            >
              Chef POS <ExternalLink size={12} />
            </a>
          </div>
        </div>

        {/* Tab switch bar */}
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1.25rem', borderTop: '1px solid #334155', paddingTop: '0.75rem' }}>
          <button 
            onClick={() => setActiveTab('menu')}
            style={{
              background: 'none', border: 'none',
              color: activeTab === 'menu' ? '#fff' : '#94a3b8',
              fontWeight: '700', paddingBottom: '4px',
              borderBottom: activeTab === 'menu' ? `3px solid ${restaurant?.themeColor}` : '3px solid transparent',
              cursor: 'pointer', fontSize: '0.9rem',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <BookOpen size={16} /> Digital Menu Editor
          </button>
          <button 
            onClick={() => setActiveTab('tables')}
            style={{
              background: 'none', border: 'none',
              color: activeTab === 'tables' ? '#fff' : '#94a3b8',
              fontWeight: '700', paddingBottom: '4px',
              borderBottom: activeTab === 'tables' ? `3px solid ${restaurant?.themeColor}` : '3px solid transparent',
              cursor: 'pointer', fontSize: '0.9rem',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <QrCode size={16} /> QR Code Table Manager
          </button>
        </div>
      </header>

      {/* Main Content Areas */}
      <main className="container" style={{ maxWidth: '1000px', flex: 1, padding: '2rem 1.5rem' }}>
        
        {/* --- Tab 1: Menu Editor --- */}
        {activeTab === 'menu' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
            
            {/* Left Col: Categories Column */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ borderBottom: '1px solid #334155', paddingBottom: '0.5rem' }}>
                <h2 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={16} style={{ color: restaurant?.themeColor }} /> Menu Categories
                </h2>
              </div>

              {/* Add category form */}
              <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  placeholder="New Category Name" 
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#fff', fontSize: '0.85rem' }}
                />
                <button type="submit" className="btn btn-primary" style={{ backgroundColor: restaurant?.themeColor, padding: '0.6rem 1rem' }}>
                  <Plus size={16} />
                </button>
              </form>

              {/* Categories list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {menu.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>No categories created yet.</p>
                ) : (
                  menu.map(cat => (
                    <div 
                      key={cat._id}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        backgroundColor: '#1e293b', border: '1px solid #334155',
                        borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem'
                      }}
                    >
                      <span style={{ fontWeight: '600' }}>{cat.name}</span>
                      <button 
                        onClick={() => handleDeleteCategory(cat._id)}
                        style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Right Col: Menu Items Column */}
            <section style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '0.5rem' }}>
                <h2 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <BookOpen size={16} style={{ color: restaurant?.themeColor }} /> Menu Dishes
                </h2>
                <button 
                  onClick={openAddItemForm}
                  className="btn btn-primary"
                  style={{ backgroundColor: restaurant?.themeColor, padding: '0.5rem 1rem', fontSize: '0.8rem', borderRadius: 'var(--radius-full)' }}
                >
                  <PlusCircle size={14} /> Add Menu Dish
                </button>
              </div>

              {/* Dishes Grid */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {menu.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', border: '2px dashed #334155', borderRadius: 'var(--radius-lg)', color: '#94a3b8' }}>
                    <AlertCircle size={32} style={{ marginBottom: '0.5rem' }} />
                    <p style={{ fontSize: '0.85rem' }}>Create a category on the left before adding dishes.</p>
                  </div>
                ) : (
                  menu.map(category => (
                    <div key={category._id} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <h3 style={{ fontSize: '0.95rem', color: '#94a3b8', borderLeft: `3px solid ${restaurant?.themeColor}`, paddingLeft: '0.5rem' }}>
                        {category.name} ({category.items?.length || 0} items)
                      </h3>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                        {category.items?.map(item => (
                          <div 
                            key={item._id}
                            style={{
                              backgroundColor: '#1e293b', border: '1px solid #334155',
                              borderRadius: 'var(--radius-lg)', padding: '0.85rem',
                              display: 'flex', gap: '0.85rem', alignItems: 'center',
                              opacity: item.isAvailable ? 1 : 0.6
                            }}
                          >
                            {item.image && (
                              <img 
                                src={item.image} 
                                alt={item.name} 
                                style={{ width: '65px', height: '65px', objectFit: 'cover', borderRadius: 'var(--radius-md)' }}
                              />
                            )}
                            
                            <div style={{ flex: 1 }}>
                              <h4 style={{ fontSize: '0.9rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {item.name}
                                {!item.isAvailable && <span style={{ fontSize: '0.65rem', color: '#f43f5e', backgroundColor: '#f43f5e15', padding: '1px 4px', borderRadius: '2px' }}>Unavailable</span>}
                              </h4>
                              <p style={{ fontSize: '0.75rem', color: '#cbd5e1', fontWeight: '800' }}>₹{item.price}</p>
                              
                              {item.options?.length > 0 && (
                                <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '2px' }}>
                                  Toppings: {item.options.map(o => o.name).join(', ')}
                                </div>
                              )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <button 
                                onClick={() => handleToggleAvailability(item)}
                                style={{ background: 'none', border: 'none', color: item.isAvailable ? '#10b981' : '#ef4444', cursor: 'pointer', padding: '4px' }}
                                title={item.isAvailable ? 'Mark Unavailable' : 'Mark Available'}
                              >
                                {item.isAvailable ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                              </button>
                              
                              <div style={{ display: 'flex', gap: '0.25rem' }}>
                                <button 
                                  onClick={() => openEditItemForm(item)}
                                  style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '4px' }}
                                >
                                  <Edit size={14} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteItem(item._id)}
                                  style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer', padding: '4px' }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

          </div>
        )}

        {/* --- Tab 2: Table QR Code Manager --- */}
        {activeTab === 'tables' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '0.5rem' }}>
              <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <QrCode size={18} style={{ color: restaurant?.themeColor }} /> Dynamic Dining Tables
              </h2>
            </div>

            {/* Add Table form */}
            <form onSubmit={handleAddTable} style={{ display: 'flex', gap: '0.75rem', maxWidth: '350px' }}>
              <input 
                type="text" 
                placeholder="E.g., Table 7, Cabin B" 
                value={newTableNumber}
                onChange={(e) => setNewTableNumber(e.target.value)}
                required
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#fff', fontSize: '0.85rem' }}
              />
              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ backgroundColor: restaurant?.themeColor, whiteSpace: 'nowrap', fontSize: '0.85rem' }}
              >
                Add Table
              </button>
            </form>

            {/* Tables QR Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '1.25rem' }}>
              {tables.length === 0 ? (
                <p style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>No dining tables configured yet.</p>
              ) : (
                tables.map(table => (
                  <div 
                    key={table._id}
                    style={{
                      backgroundColor: '#1e293b', border: '1px solid #334155',
                      borderRadius: 'var(--radius-lg)', padding: '1.25rem',
                      display: 'flex', flexDirection: 'column', gap: '0.75rem',
                      textAlign: 'center', alignItems: 'center'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: '700' }}>{table.tableNumber}</h4>
                      <button 
                        onClick={() => handleDeleteTable(table._id)}
                        style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* Small QR thumbnail */}
                    <div style={{ backgroundColor: '#fff', padding: '6px', borderRadius: '4px', display: 'flex', justifyContent: 'center' }}>
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(getTableClientUrl(table._id))}`}
                        alt="Table QR" 
                        style={{ width: '110px', height: '110px' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', marginTop: '0.25rem' }}>
                      <button 
                        onClick={() => setSelectedQrTable(table)}
                        className="btn btn-secondary"
                        style={{ width: '100%', padding: '0.45rem', fontSize: '0.75rem', backgroundColor: '#334155', border: 'none', color: '#fff' }}
                      >
                        Enlarge & Print QR
                      </button>
                      <a 
                        href={getTableClientUrl(table._id)} 
                        target="_blank" 
                        rel="noreferrer"
                        style={{ fontSize: '0.7rem', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}
                      >
                        Test Ordering client <ExternalLink size={10} />
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

      </main>

      {/* --- ADD / EDIT DISH MODAL DIALOG --- */}
      {isFormOpen && (
        <div className="custom-modal-backdrop" onClick={() => setIsFormOpen(false)}>
          <div className="custom-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px', maxHeight: '90vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem' }}>
                {editingItem ? `Edit ${editingItem.name}` : 'Add New Menu Dish'}
              </h3>
              <button 
                onClick={() => setIsFormOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <Trash2 size={18} />
              </button>
            </div>

            <form onSubmit={handleItemSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', maxHeight: '70vh', paddingRight: '4px' }}>
              
              {/* Name and Price */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>Dish Name *</label>
                  <input 
                    type="text" required value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="E.g., Pepper Pizza"
                    style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#fff', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>Price *</label>
                  <input 
                    type="number" required value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} placeholder="299"
                    style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#fff', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>Description</label>
                <textarea 
                  rows={2} value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} placeholder="Describe toppings, cooking specs, size, etc."
                  style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#fff', resize: 'none', fontSize: '0.85rem' }}
                />
              </div>

              {/* Category and Image URL */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>Category Group *</label>
                  <select 
                    value={itemCategoryId} onChange={(e) => setItemCategoryId(e.target.value)} required
                    style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#fff', fontSize: '0.85rem' }}
                  >
                    {menu.map(cat => <option key={cat._id} value={cat._id}>{cat.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>Dish Image</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={uploading}
                      style={{ fontSize: '0.8rem', color: '#cbd5e1' }}
                    />
                    {uploading && (
                      <div style={{ width: '100%', backgroundColor: '#334155', borderRadius: 'var(--radius-full)', height: '8px', overflow: 'hidden' }}>
                        <div style={{ width: `${uploadProgress}%`, backgroundColor: restaurant?.themeColor || '#e11d48', height: '100%', transition: 'width 0.2s ease' }}></div>
                      </div>
                    )}
                    {itemImage && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <img src={itemImage} alt="Preview" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />
                        <span style={{ fontSize: '0.7rem', color: '#10b981' }}>✓ Uploaded successfully</span>
                        <button 
                          type="button" 
                          onClick={() => setItemImage('')}
                          style={{ background: 'none', border: 'none', color: '#f43f5e', fontSize: '0.7rem', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Toppings / Options Builder */}
              <div style={{ borderTop: '1px dashed #334155', paddingTop: '1rem', marginTop: '0.25rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#fff', display: 'block', marginBottom: '0.5rem' }}>
                  Custom toppings & choice options
                </label>
                
                {/* Active options list */}
                {itemOptions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                    {itemOptions.map((opt, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyBetween: 'center', backgroundColor: '#0f172a', border: '1px solid #334155', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                        <div>
                          <strong style={{ color: restaurant?.themeColor }}>{opt.name}: </strong>
                          <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                            {opt.choices.map(c => `${c.name} (+₹${c.priceAdjustment})`).join(', ')}
                          </span>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => handleRemoveOption(idx)}
                          style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer' }}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Option editor rows */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr auto', gap: '0.5rem', alignItems: 'flex-end', backgroundColor: '#0f172a', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>Option (e.g. Size)</label>
                    <input 
                      type="text" value={optName} onChange={(e) => setOptName(e.target.value)} placeholder="Size"
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#fff', fontSize: '0.8rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>Choices (Format: Name:Price, ...)</label>
                    <input 
                      type="text" value={optChoicesString} onChange={(e) => setOptChoicesString(e.target.value)} placeholder="Regular:0, Medium:150, Large:250"
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#fff', fontSize: '0.8rem' }}
                    />
                  </div>
                  <button 
                    type="button" 
                    onClick={handleAddOption}
                    className="btn btn-secondary"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', backgroundColor: '#334155', border: 'none', color: '#fff' }}
                  >
                    Add Option
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ borderTop: '1px solid #334155', paddingTop: '1rem', marginTop: '0.5rem', display: 'flex', gap: '0.75rem' }}>
                <button 
                  type="button" className="btn btn-secondary" onClick={() => setIsFormOpen(false)}
                  style={{ flex: 1, backgroundColor: '#334155', border: 'none', color: '#fff' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" className="btn btn-primary"
                  style={{ flex: 2, backgroundColor: restaurant?.themeColor, color: '#fff' }}
                >
                  Save Dish Details
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* --- ENLARGED QR PRINT MODAL DIALOG --- */}
      {selectedQrTable && (
        <div className="custom-modal-backdrop" onClick={() => setSelectedQrTable(null)}>
          <div className="custom-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '360px', textAlign: 'center', padding: '2rem' }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '4px' }}>{restaurant?.name}</h3>
            <span className="badge badge-primary" style={{ backgroundColor: restaurant?.themeColor, color: '#fff' }}>
              {selectedQrTable.tableNumber} QR Code
            </span>

            {/* Big QR Image */}
            <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: 'var(--radius-lg)', margin: '1.5rem auto', display: 'flex', justifyContent: 'center', width: '220px', height: '220px', boxShadow: 'var(--shadow-md)' }}>
              <img 
                src={getTableQrUrl(selectedQrTable._id)}
                alt="Table QR Large" 
                style={{ width: '100%', height: '100%' }}
              />
            </div>

            <p style={{ fontSize: '0.75rem', color: '#94a3b8', wordBreak: 'break-all', marginBottom: '1.5rem', backgroundColor: '#0f172a', padding: '0.5rem', borderRadius: '4px' }}>
              Scan URL: <br />
              <a href={getTableClientUrl(selectedQrTable._id)} target="_blank" rel="noreferrer" style={{ color: '#38bdf8' }}>
                {getTableClientUrl(selectedQrTable._id)}
              </a>
            </p>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setSelectedQrTable(null)}
                style={{ flex: 1, backgroundColor: '#334155', border: 'none', color: '#fff' }}
              >
                Close Window
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => window.print()}
                style={{ flex: 1, backgroundColor: restaurant?.themeColor }}
              >
                Print Ticket
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
