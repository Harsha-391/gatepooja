import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_BASE || (
  import.meta.env.MODE === 'production'
    ? '' // Relative path in production (same domain Vercel deployment)
    : 'http://localhost:5000' // Local development backend fallback
);

// Tenant Subdomain Helper
const getSlug = () => {
  const host = window.location.hostname;
  const parts = host.split('.');
  if (parts.length > 1 && parts[parts.length - 2] !== 'www') {
    return parts[0];
  }
  // Fallback storage check for route parameter resolution compatibility
  const savedSlug = sessionStorage.getItem('tenant_slug');
  return savedSlug || 'bite-of-italy';
};

// Automatic Header Injection
const getHeaders = (contentType = 'application/json') => {
  const headers = {};
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  headers['X-Tenant-Slug'] = getSlug();
  
  const token = localStorage.getItem('tenant_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// REST API helper functions
export const api = {
  // Save slug for path fallback routes
  saveTenantSlug: (slug) => {
    if (slug) sessionStorage.setItem('tenant_slug', slug);
  },

  // Resolved from headers automatically
  getRestaurantInfo: async () => {
    const res = await fetch(`${API_BASE}/api/restaurants/info`, {
      headers: getHeaders(null)
    });
    if (!res.ok) throw new Error('Failed to fetch restaurant info');
    return res.json();
  },

  getAllRestaurants: async () => {
    const res = await fetch(`${API_BASE}/api/restaurants`);
    if (!res.ok) throw new Error('Failed to fetch restaurants list');
    return res.json();
  },

  onboardRestaurant: async (payload) => {
    const res = await fetch(`${API_BASE}/api/restaurants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to onboard restaurant');
    }
    return res.json();
  },

  deleteRestaurant: async (restaurantId) => {
    const res = await fetch(`${API_BASE}/api/restaurants/${restaurantId}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to delete restaurant');
    }
    return res.json();
  },

  // Owner Login authentication
  login: async (username, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to log in');
    }
    const data = await res.json();
    localStorage.setItem('tenant_token', data.token);
    return data;
  },

  logout: () => {
    localStorage.removeItem('tenant_token');
  },

  isAuthenticated: () => {
    return !!localStorage.getItem('tenant_token');
  },

  // Scoped Categories
  addCategory: async (name) => {
    const res = await fetch(`${API_BASE}/api/categories`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error('Failed to add category');
    return res.json();
  },

  deleteCategory: async (categoryId) => {
    const res = await fetch(`${API_BASE}/api/categories/${categoryId}`, {
      method: 'DELETE',
      headers: getHeaders(null)
    });
    if (!res.ok) throw new Error('Failed to delete category');
    return res.json();
  },

  // Scoped Menu Items
  addMenuItem: async (itemPayload) => {
    const res = await fetch(`${API_BASE}/api/items`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(itemPayload)
    });
    if (!res.ok) throw new Error('Failed to add menu item');
    return res.json();
  },

  editMenuItem: async (itemId, itemPayload) => {
    const res = await fetch(`${API_BASE}/api/items/${itemId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(itemPayload)
    });
    if (!res.ok) throw new Error('Failed to edit menu item');
    return res.json();
  },

  deleteMenuItem: async (itemId) => {
    const res = await fetch(`${API_BASE}/api/items/${itemId}`, {
      method: 'DELETE',
      headers: getHeaders(null)
    });
    if (!res.ok) throw new Error('Failed to delete menu item');
    return res.json();
  },

  // Scoped Dining Tables
  addTable: async (tableNumber) => {
    const res = await fetch(`${API_BASE}/api/tables`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ tableNumber })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to add table');
    }
    return res.json();
  },

  deleteTable: async (tableId) => {
    const res = await fetch(`${API_BASE}/api/tables/${tableId}`, {
      method: 'DELETE',
      headers: getHeaders(null)
    });
    if (!res.ok) throw new Error('Failed to delete table');
    return res.json();
  },

  getMenu: async () => {
    const res = await fetch(`${API_BASE}/api/menu`, {
      headers: getHeaders(null)
    });
    if (!res.ok) throw new Error('Failed to fetch menu');
    return res.json();
  },

  getTable: async (tableId) => {
    const res = await fetch(`${API_BASE}/api/tables/${tableId}`, {
      headers: getHeaders(null)
    });
    if (!res.ok) throw new Error('Failed to fetch table');
    return res.json();
  },

  getDashboardData: async () => {
    const res = await fetch(`${API_BASE}/api/dashboard`, {
      headers: getHeaders(null)
    });
    if (!res.ok) throw new Error('Failed to fetch dashboard data');
    return res.json();
  },

  sendOtp: async (mobileNumber) => {
    const res = await fetch(`${API_BASE}/api/otp/send`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ mobileNumber })
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.message || 'Failed to send OTP');
    }
    return res.json();
  },

  placeOrder: async (orderPayload) => {
    const res = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(orderPayload)
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.message || 'Failed to place order');
    }
    return res.json();
  },

  updateOrderStatus: async (orderId, status) => {
    const res = await fetch(`${API_BASE}/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Failed to update order status');
    return res.json();
  },

  clearTable: async (tableId) => {
    const res = await fetch(`${API_BASE}/api/tables/${tableId}/clear`, {
      method: 'POST',
      headers: getHeaders(null)
    });
    if (!res.ok) throw new Error('Failed to clear table');
    return res.json();
  }
};

// Singleton socket connection helper
let socket = null;

export const getSocket = () => {
  if (!socket) {
    socket = io(API_BASE || window.location.origin, {
      autoConnect: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });
  }
  return socket;
};
