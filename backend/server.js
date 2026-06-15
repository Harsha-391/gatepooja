import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Restaurant, Table, Category, MenuItem, Order, Otp } from './models.js';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';

dotenv.config();

// Initialize Firebase Admin with credentials from json file or env
let firebaseEnabled = false;
let db = null;
try {
  let credentials = null;

  // 1. Try JSON file first
  try {
    credentials = JSON.parse(
      readFileSync(new URL('./firebase-service-account.json', import.meta.url))
    );
  } catch (e) {
    // JSON file not found or invalid
  }

  // 2. Fallback to Env if JSON not found and env is not placeholder
  if (!credentials && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    if (!process.env.FIREBASE_PRIVATE_KEY.includes('YOUR_PRIVATE_KEY_HERE')) {
      credentials = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      };
    }
  }

  if (credentials) {
    admin.initializeApp({
      credential: admin.cert(credentials)
    });
    firebaseEnabled = true;
    db = getFirestore();
    console.log('Firebase Admin initialized & Firestore connected successfully.');
  } else {
    throw new Error('No valid credentials provided in env or JSON file');
  }
} catch (err) {
  console.warn('\n=================================================================================');
  console.warn('WARNING: Firebase Admin credentials not found or invalid.');
  console.warn('Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in backend/.env');
  console.warn('OR place firebase-service-account.json inside the backend folder.');
  console.warn('=================================================================================\n');
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
  }
});

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_tenancy_key_for_qr_saas';

// --- FIRESTORE COMPATIBILITY MAPPERS ---
const mapDoc = (doc) => {
  if (!doc.exists) return null;
  return { _id: doc.id, ...doc.data() };
};

const mapDocs = (snapshot) => {
  const list = [];
  snapshot.forEach(doc => {
    list.push(mapDoc(doc));
  });
  return list;
};

// Check if Firebase is enabled helper
const checkDb = (req, res, next) => {
  if (!firebaseEnabled || !db) {
    return res.status(500).json({ message: 'Database (Firestore) is not configured. Add firebase-service-account.json' });
  }
  next();
};

// --- MIDDLEWARES ---

// 1. Tenant Resolution Middleware (Header-Based RLS)
async function resolveTenant(req, res, next) {
  const tenantSlug = req.headers['x-tenant-slug'];
  if (!tenantSlug) {
    return res.status(400).json({ message: 'Tenant context is missing (X-Tenant-Slug header is required)' });
  }

  if (!db) {
    return res.status(500).json({ message: 'Database is not initialized.' });
  }

  try {
    const snap = await db.collection(Restaurant)
      .where('slug', '==', tenantSlug.toLowerCase())
      .limit(1)
      .get();

    if (snap.empty) {
      return res.status(404).json({ message: 'Cafe / Restaurant not found' });
    }
    req.tenant = mapDoc(snap.docs[0]);
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// 2. Cafe Owner Authentication Middleware
function authenticateTenantAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization token is required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.tenantId !== req.tenant._id.toString()) {
      return res.status(403).json({ message: 'Access denied: Token tenant context mismatch' });
    }
    req.adminUser = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// --- REST ENDPOINTS ---

// 0. Superadmin: Get first restaurant (diagnostics / portal redirection helper)
app.get('/api/restaurants/first', checkDb, async (req, res) => {
  try {
    const snap = await db.collection(Restaurant).limit(1).get();
    if (snap.empty) {
      return res.status(404).json({ message: 'No restaurants seeded yet' });
    }
    const restaurant = mapDoc(snap.docs[0]);
    
    const tablesSnap = await db.collection(Table)
      .where('restaurantId', '==', restaurant._id)
      .get();
    const tables = mapDocs(tablesSnap).sort((a, b) => a.tableNumber.localeCompare(b.tableNumber));
    
    res.json({ restaurant, tables });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 0.1 Send OTP code to Mobile Number (SMS Simulator / Real Gateway Fallback)
app.post('/api/otp/send', checkDb, async (req, res) => {
  try {
    const { mobileNumber } = req.body;
    if (!mobileNumber || mobileNumber.length < 10) {
      return res.status(400).json({ message: 'Valid 10-digit mobile number is required' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await db.collection(Otp).doc(mobileNumber).set({
      mobileNumber,
      code,
      createdAt: new Date().toISOString()
    });

    console.log(`\n======================================================`);
    console.log(`[SMS SENDER] Generated verification OTP code: ${code}`);
    console.log(`To Mobile Number: ${mobileNumber}`);
    console.log(`======================================================\n`);

    let sentRealSms = false;
    let gatewayUsed = null;
    let gatewayError = null;

    // 1. Try Twilio Gateway
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

    if (twilioSid && twilioToken && twilioFrom) {
      try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
        const authHeader = 'Basic ' + Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
        const formattedPhone = mobileNumber.startsWith('+') ? mobileNumber : `+91${mobileNumber}`;
        
        const params = new URLSearchParams();
        params.append('To', formattedPhone);
        params.append('From', twilioFrom);
        params.append('Body', `Your Gatecode Cafe Management Software verification OTP code is: ${code}`);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params.toString()
        });

        if (response.ok) {
          sentRealSms = true;
          gatewayUsed = 'Twilio';
          console.log(`[Twilio SMS] Real SMS sent successfully to ${formattedPhone}`);
        } else {
          const errBody = await response.json();
          gatewayError = errBody.message || 'Twilio response error';
          console.error('[Twilio SMS Failed]', errBody);
        }
      } catch (err) {
        gatewayError = err.message;
        console.error('[Twilio SMS Exception]', err);
      }
    }

    // 2. Try Fast2SMS Gateway if Twilio is not configured
    const fast2smsKey = process.env.FAST2SMS_API_KEY;
    if (!sentRealSms && fast2smsKey) {
      try {
        const cleanNumber = mobileNumber.replace(/\D/g, '');
        // Fast2SMS OTP route URL
        const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${fast2smsKey}&variables_values=${code}&route=otp&numbers=${cleanNumber}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (response.ok && data.return === true) {
          sentRealSms = true;
          gatewayUsed = 'Fast2SMS';
          console.log(`[Fast2SMS] Real SMS sent successfully to ${cleanNumber}`);
        } else {
          gatewayError = data.message || 'Fast2SMS response error';
          console.error('[Fast2SMS Failed]', data);
        }
      } catch (err) {
        gatewayError = err.message;
        console.error('[Fast2SMS Exception]', err);
      }
    }

    res.json({ 
      message: sentRealSms 
        ? `OTP sent successfully via ${gatewayUsed}!` 
        : 'OTP generated (Simulated - no credentials provided in backend .env)',
      otp: code,
      sentRealSms,
      gatewayError
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 0.2 Public: Get branding info for tenant resolved from header
app.get('/api/restaurants/info', checkDb, resolveTenant, async (req, res) => {
  try {
    const tablesSnap = await db.collection(Table)
      .where('restaurantId', '==', req.tenant._id)
      .get();
    const tables = mapDocs(tablesSnap).sort((a, b) => a.tableNumber.localeCompare(b.tableNumber));
    
    const safeRestaurant = {
      _id: req.tenant._id,
      name: req.tenant.name,
      slug: req.tenant.slug,
      logo: req.tenant.logo,
      themeColor: req.tenant.themeColor,
      createdAt: req.tenant.createdAt
    };
    res.json({ restaurant: safeRestaurant, tables });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 0.3 Public: Login Cafe Owner / POS staff
app.post('/api/auth/login', checkDb, resolveTenant, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    if (req.tenant.adminUsername !== username.toLowerCase()) {
      return res.status(401).json({ message: 'Invalid admin username or password.' });
    }

    const isMatch = await bcrypt.compare(password, req.tenant.adminPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid admin username or password.' });
    }

    const token = jwt.sign(
      { tenantId: req.tenant._id, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      restaurant: {
        _id: req.tenant._id,
        name: req.tenant.name,
        slug: req.tenant.slug,
        logo: req.tenant.logo,
        themeColor: req.tenant.themeColor
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- SUPERADMIN ONBOARDING ENDPOINTS ---

// Get all restaurants for directory lists
app.get('/api/restaurants', checkDb, async (req, res) => {
  try {
    const snap = await db.collection(Restaurant).get();
    const restaurants = mapDocs(snap).map(r => {
      delete r.adminPassword;
      return r;
    });
    restaurants.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(restaurants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new restaurant
app.post('/api/restaurants', checkDb, async (req, res) => {
  try {
    const { name, slug, themeColor, logo, adminUsername, adminPassword } = req.body;
    if (!name || !slug || !adminUsername || !adminPassword) {
      return res.status(400).json({ message: 'Name, slug, adminUsername, and adminPassword are required' });
    }

    const normalizedSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const existingSlugSnap = await db.collection(Restaurant).where('slug', '==', normalizedSlug).limit(1).get();
    if (!existingSlugSnap.empty) {
      return res.status(400).json({ message: 'Subdomain slug is already in use.' });
    }

    const existingUserSnap = await db.collection(Restaurant).where('adminUsername', '==', adminUsername.toLowerCase()).limit(1).get();
    if (!existingUserSnap.empty) {
      return res.status(400).json({ message: 'Admin Username is already in use globally.' });
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const restRef = await db.collection(Restaurant).add({
      name,
      slug: normalizedSlug,
      adminUsername: adminUsername.toLowerCase(),
      adminPassword: hashedPassword,
      themeColor: themeColor || '#e11d48',
      logo: logo || '☕',
      createdAt: new Date().toISOString()
    });

    const restaurantId = restRef.id;

    // Seed 4 default tables
    const tables = [];
    for (let i = 1; i <= 4; i++) {
      const tableData = {
        restaurantId: restaurantId,
        tableNumber: `Table ${i}`,
        status: 'vacant',
        activeCart: [],
        verifiedMobileNumber: null,
        createdAt: new Date().toISOString()
      };
      const tabRef = await db.collection(Table).add(tableData);
      tables.push({ _id: tabRef.id, ...tableData });
    }

    // Seed 1 default category
    await db.collection(Category).add({
      restaurantId: restaurantId,
      name: 'Mains',
      displayOrder: 1
    });

    const restaurant = {
      _id: restaurantId,
      name,
      slug: normalizedSlug,
      adminUsername: adminUsername.toLowerCase(),
      themeColor: themeColor || '#e11d48',
      logo: logo || '☕'
    };

    res.status(201).json({ restaurant, tables });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete restaurant
app.delete('/api/restaurants/:restaurantId', checkDb, async (req, res) => {
  try {
    const { restaurantId } = req.params;

    // Verify restaurant exists
    const restRef = db.collection(Restaurant).doc(restaurantId);
    const restDoc = await restRef.get();
    if (!restDoc.exists) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    // Delete restaurant document
    await restRef.delete();

    // Delete all associated tables
    const tablesSnap = await db.collection(Table).where('restaurantId', '==', restaurantId).get();
    const batchTables = db.batch();
    let deletedTablesCount = 0;
    tablesSnap.forEach(doc => {
      batchTables.delete(doc.ref);
      deletedTablesCount++;
    });
    if (deletedTablesCount > 0) {
      await batchTables.commit();
    }

    // Delete all associated categories
    const categoriesSnap = await db.collection(Category).where('restaurantId', '==', restaurantId).get();
    const batchCategories = db.batch();
    let deletedCategoriesCount = 0;
    categoriesSnap.forEach(doc => {
      batchCategories.delete(doc.ref);
      deletedCategoriesCount++;
    });
    if (deletedCategoriesCount > 0) {
      await batchCategories.commit();
    }

    // Delete all associated menu items
    const itemsSnap = await db.collection(MenuItem).where('restaurantId', '==', restaurantId).get();
    const batchItems = db.batch();
    let deletedItemsCount = 0;
    itemsSnap.forEach(doc => {
      batchItems.delete(doc.ref);
      deletedItemsCount++;
    });
    if (deletedItemsCount > 0) {
      await batchItems.commit();
    }

    // Delete all associated orders
    const ordersSnap = await db.collection(Order).where('restaurantId', '==', restaurantId).get();
    const batchOrders = db.batch();
    let deletedOrdersCount = 0;
    ordersSnap.forEach(doc => {
      batchOrders.delete(doc.ref);
      deletedOrdersCount++;
    });
    if (deletedOrdersCount > 0) {
      await batchOrders.commit();
    }

    res.json({ message: 'Restaurant and all associated tables, categories, menu items, and orders deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- TENANT-SPECIFIC SECURED ROUTES (ROW-LEVEL SECURITY) ---


// Add Category
app.post('/api/categories', checkDb, resolveTenant, authenticateTenantAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Category name is required' });

    const catSnap = await db.collection(Category).where('restaurantId', '==', req.tenant._id).get();
    const displayOrder = catSnap.size + 1;

    const catRef = await db.collection(Category).add({
      restaurantId: req.tenant._id,
      name,
      displayOrder
    });

    res.status(201).json({
      _id: catRef.id,
      restaurantId: req.tenant._id,
      name,
      displayOrder
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Category
app.delete('/api/categories/:categoryId', checkDb, resolveTenant, authenticateTenantAdmin, async (req, res) => {
  try {
    const { categoryId } = req.params;

    // Delete items in category scoped to tenant
    const itemsSnap = await db.collection(MenuItem)
      .where('restaurantId', '==', req.tenant._id)
      .where('categoryId', '==', categoryId)
      .get();

    const batch = db.batch();
    itemsSnap.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Delete category
    const catRef = db.collection(Category).doc(categoryId);
    const catDoc = await catRef.get();
    if (!catDoc.exists || catDoc.data().restaurantId !== req.tenant._id) {
      return res.status(404).json({ message: 'Category not found' });
    }

    await catRef.delete();
    res.json({ message: 'Category and all associated items deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add Menu Item
app.post('/api/items', checkDb, resolveTenant, authenticateTenantAdmin, async (req, res) => {
  try {
    const { name, description, price, categoryId, image, options } = req.body;
    if (!name || !price || !categoryId) {
      return res.status(400).json({ message: 'Name, price, and category are required' });
    }

    // Verify category belongs to this tenant
    const catRef = db.collection(Category).doc(categoryId);
    const catDoc = await catRef.get();
    if (!catDoc.exists || catDoc.data().restaurantId !== req.tenant._id) {
      return res.status(400).json({ message: 'Invalid category for this restaurant.' });
    }

    const itemData = {
      restaurantId: req.tenant._id,
      categoryId,
      name,
      description: description || '',
      price: Number(price),
      image: image || '',
      options: options || [],
      isAvailable: true,
      createdAt: new Date().toISOString()
    };

    const itemRef = await db.collection(MenuItem).add(itemData);
    res.status(201).json({ _id: itemRef.id, ...itemData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Edit Menu Item
app.put('/api/items/:itemId', checkDb, resolveTenant, authenticateTenantAdmin, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { name, description, price, categoryId, image, options, isAvailable } = req.body;

    const itemRef = db.collection(MenuItem).doc(itemId);
    const itemDoc = await itemRef.get();
    if (!itemDoc.exists || itemDoc.data().restaurantId !== req.tenant._id) {
      return res.status(404).json({ message: 'Menu item not found' });
    }

    const updatedData = {
      name,
      description: description || '',
      price: Number(price),
      categoryId,
      image: image || '',
      options: options || [],
      isAvailable: isAvailable !== undefined ? isAvailable : true
    };

    await itemRef.update(updatedData);
    res.json({ _id: itemId, ...itemDoc.data(), ...updatedData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Menu Item
app.delete('/api/items/:itemId', checkDb, resolveTenant, authenticateTenantAdmin, async (req, res) => {
  try {
    const { itemId } = req.params;
    const itemRef = db.collection(MenuItem).doc(itemId);
    const itemDoc = await itemRef.get();
    if (!itemDoc.exists || itemDoc.data().restaurantId !== req.tenant._id) {
      return res.status(404).json({ message: 'Menu item not found' });
    }

    await itemRef.delete();
    res.json({ message: 'Menu item deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add Table
app.post('/api/tables', checkDb, resolveTenant, authenticateTenantAdmin, async (req, res) => {
  try {
    const { tableNumber } = req.body;
    if (!tableNumber) return res.status(400).json({ message: 'Table designation is required' });

    const existingSnap = await db.collection(Table)
      .where('restaurantId', '==', req.tenant._id)
      .where('tableNumber', '==', tableNumber)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      return res.status(400).json({ message: `Table '${tableNumber}' already exists.` });
    }

    const tableData = {
      restaurantId: req.tenant._id,
      tableNumber,
      status: 'vacant',
      activeCart: [],
      verifiedMobileNumber: null,
      createdAt: new Date().toISOString()
    };

    const tabRef = await db.collection(Table).add(tableData);
    const table = { _id: tabRef.id, ...tableData };

    // Notify admin POS
    io.to(`room:restaurant:${req.tenant._id}:admin`).emit('table_status_change', {
      tableId: table._id,
      status: 'vacant',
      activeCart: []
    });

    res.status(201).json(table);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Table
app.delete('/api/tables/:tableId', checkDb, resolveTenant, authenticateTenantAdmin, async (req, res) => {
  try {
    const { tableId } = req.params;
    const tabRef = db.collection(Table).doc(tableId);
    const tabDoc = await tabRef.get();
    if (!tabDoc.exists || tabDoc.data().restaurantId !== req.tenant._id) {
      return res.status(404).json({ message: 'Table not found' });
    }

    await tabRef.delete();

    // Notify admin POS
    io.to(`room:restaurant:${req.tenant._id}:admin`).emit('table_deleted', { tableId });
    res.json({ message: 'Table removed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Menu (Public Customer Endpoint, resolved via header)
app.get('/api/menu', checkDb, resolveTenant, async (req, res) => {
  try {
    const catSnap = await db.collection(Category)
      .where('restaurantId', '==', req.tenant._id)
      .get();
    const categories = mapDocs(catSnap).sort((a, b) => a.displayOrder - b.displayOrder);

    const itemSnap = await db.collection(MenuItem)
      .where('restaurantId', '==', req.tenant._id)
      .where('isAvailable', '==', true)
      .get();
    const items = mapDocs(itemSnap);

    const menu = categories.map((cat) => {
      return {
        _id: cat._id,
        name: cat.name,
        items: items.filter((item) => item.categoryId === cat._id)
      };
    });

    res.json(menu);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Table details (Public Customer lookup)
app.get('/api/tables/:tableId', checkDb, resolveTenant, async (req, res) => {
  try {
    const tableId = req.params.tableId;
    const tabRef = db.collection(Table).doc(tableId);
    const tabDoc = await tabRef.get();
    if (!tabDoc.exists || tabDoc.data().restaurantId !== req.tenant._id) {
      return res.status(404).json({ message: 'Table not found' });
    }
    const table = mapDoc(tabDoc);

    let activeOrder = null;
    if (table.status === 'ordered' || table.status === 'billed') {
      const orderSnap = await db.collection(Order)
        .where('tableId', '==', tableId)
        .where('status', 'in', ['pending', 'preparing', 'served'])
        .get();
      const orders = mapDocs(orderSnap);
      if (orders.length > 0) {
        orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        activeOrder = orders[0];
      }
    }

    res.json({ table, activeOrder });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Dashboard Data (Protected POS API)
app.get('/api/dashboard', checkDb, resolveTenant, authenticateTenantAdmin, async (req, res) => {
  try {
    const tablesSnap = await db.collection(Table)
      .where('restaurantId', '==', req.tenant._id)
      .get();
    const tables = mapDocs(tablesSnap).sort((a, b) => a.tableNumber.localeCompare(b.tableNumber));

    const ordersSnap = await db.collection(Order)
      .where('restaurantId', '==', req.tenant._id)
      .where('status', 'in', ['pending', 'preparing', 'served'])
      .get();
    const activeOrders = mapDocs(ordersSnap).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ tables, activeOrders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Place an Order (Public Customer Endpoint)
app.post('/api/orders', checkDb, resolveTenant, async (req, res) => {
  try {
    const { tableId, items, mobileNumber, otp } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    if (!mobileNumber || mobileNumber.length < 10) {
      return res.status(400).json({ message: 'Valid mobile number is required' });
    }

    // Verify table belongs to tenant
    const tabRef = db.collection(Table).doc(tableId);
    const tabDoc = await tabRef.get();
    if (!tabDoc.exists || tabDoc.data().restaurantId !== req.tenant._id) {
      return res.status(404).json({ message: 'Table not found' });
    }
    const table = mapDoc(tabDoc);

    // Verify OTP if mobile is not already verified on table
    if (table.verifiedMobileNumber !== mobileNumber) {
      if (!otp) {
        return res.status(400).json({ message: 'Mobile verification token (OTP) is required' });
      }

      let otpVerified = false;

      // 1. Try to verify using database-backed simulated OTP
      try {
        const cleanMobile = mobileNumber.replace(/\D/g, '');
        const otpDoc = await db.collection(Otp).doc(cleanMobile).get();
        if (otpDoc.exists) {
          const otpData = otpDoc.data();
          const isMatch = otpData.code === otp;
          const isRecent = (new Date() - new Date(otpData.createdAt)) < 10 * 60 * 1000; // 10 minutes expiry
          if (isMatch && isRecent) {
            otpVerified = true;
            console.log(`[OTP VERIFICATION] Successfully verified simulated OTP code ${otp} for mobile: ${mobileNumber}`);
          }
        }
      } catch (err) {
        console.warn('Error reading simulated OTP from firestore:', err.message);
      }

      // 2. If not verified via simulator, fallback to standard Firebase ID Token verification
      if (!otpVerified) {
        if (firebaseEnabled) {
          try {
            const decodedToken = await getAuth().verifyIdToken(otp);
            const verifiedPhone = decodedToken.phone_number;

            const cleanMobile = mobileNumber.replace(/\D/g, '');
            const cleanVerified = verifiedPhone.replace(/\D/g, '');
            if (!cleanVerified.endsWith(cleanMobile)) {
              return res.status(400).json({ message: 'Verification mobile number mismatch.' });
            }
            otpVerified = true;
          } catch (err) {
            console.error('Firebase token verification failed:', err);
            return res.status(400).json({ message: 'Invalid or expired Firebase verification session.' });
          }
        } else {
          console.log(`[DEV MODE FALLBACK] Skipping Firebase token verification for ${mobileNumber}. (Firebase Admin is disabled)`);
          otpVerified = true;
        }
      }

      if (!otpVerified) {
        return res.status(400).json({ message: 'Invalid or expired verification code.' });
      }
    }

    let calculatedSubtotal = 0;
    const verifiedItems = [];

    for (const item of items) {
      const itemRef = db.collection(MenuItem).doc(item.menuItemId);
      const itemDoc = await itemRef.get();
      if (!itemDoc.exists || itemDoc.data().restaurantId !== req.tenant._id || !itemDoc.data().isAvailable) {
        return res.status(400).json({ message: `Item ${item.name} is no longer available.` });
      }
      const dbItem = itemDoc.data();

      let optionsPriceAdjustment = 0;
      const verifiedOptions = [];

      if (item.selectedOptions && item.selectedOptions.length > 0) {
        for (const opt of item.selectedOptions) {
          const dbOptDef = dbItem.options.find(o => o.name === opt.optionName);
          if (dbOptDef) {
            const dbChoice = dbOptDef.choices.find(c => c.name === opt.choiceName);
            if (dbChoice) {
              optionsPriceAdjustment += dbChoice.priceAdjustment;
              verifiedOptions.push({
                optionName: opt.optionName,
                choiceName: opt.choiceName,
                priceAdjustment: dbChoice.priceAdjustment
              });
            }
          }
        }
      }

      const basePrice = dbItem.price;
      const unitTotal = basePrice + optionsPriceAdjustment;
      calculatedSubtotal += unitTotal * item.quantity;

      verifiedItems.push({
        menuItemId: itemRef.id,
        name: dbItem.name,
        quantity: item.quantity,
        price: basePrice,
        selectedOptions: verifiedOptions,
        instructions: item.instructions || ''
      });
    }

    const TAX_RATE = 0.05;
    const calculatedTax = parseFloat((calculatedSubtotal * TAX_RATE).toFixed(2));
    const calculatedTotal = parseFloat((calculatedSubtotal + calculatedTax).toFixed(2));

    const orderData = {
      restaurantId: req.tenant._id,
      tableId,
      mobileNumber,
      items: verifiedItems,
      subtotal: calculatedSubtotal,
      tax: calculatedTax,
      total: calculatedTotal,
      status: 'pending',
      paymentStatus: 'pending',
      createdAt: new Date().toISOString()
    };

    const orderRef = await db.collection(Order).add(orderData);
    const newOrder = {
      _id: orderRef.id,
      ...orderData,
      tableId: table
    };

    await tabRef.update({
      status: 'ordered',
      activeCart: [],
      verifiedMobileNumber: mobileNumber
    });

    // Notify admin
    io.to(`room:restaurant:${req.tenant._id}:admin`).emit('new_order', newOrder);
    
    // Broadcast order state to table room
    io.to(`room:table:${tableId}`).emit('order_placed', {
      orderId: newOrder._id,
      status: newOrder.status,
      tableStatus: 'ordered',
      activeCart: [],
      verifiedMobileNumber: mobileNumber
    });

    // Broadcast table state change to admin
    io.to(`room:restaurant:${req.tenant._id}:admin`).emit('table_status_change', {
      tableId,
      status: 'ordered',
      activeCart: [],
      verifiedMobileNumber: mobileNumber
    });

    res.status(201).json(newOrder);
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update Order Status (Protected Chef POS endpoint)
app.patch('/api/orders/:orderId/status', checkDb, resolveTenant, authenticateTenantAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const orderRef = db.collection(Order).doc(req.params.orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists || orderDoc.data().restaurantId !== req.tenant._id) {
      return res.status(404).json({ message: 'Order not found' });
    }

    await orderRef.update({ status });
    const order = { _id: orderDoc.id, ...orderDoc.data(), status };

    if (status === 'served') {
      const tabRef = db.collection(Table).doc(order.tableId);
      const tabDoc = await tabRef.get();
      if (tabDoc.exists && tabDoc.data().status === 'ordered') {
        await tabRef.update({ status: 'billed' });
        io.to(`room:restaurant:${req.tenant._id}:admin`).emit('table_status_change', {
          tableId: order.tableId,
          status: 'billed'
        });
      }
    }

    // Broadcast order update to table room
    io.to(`room:table:${order.tableId}`).emit('order_status_change', {
      orderId: order._id,
      status: order.status
    });

    // Broadcast update to admin room
    io.to(`room:restaurant:${req.tenant._id}:admin`).emit('order_updated', order);

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear Table / Reset (Protected POS endpoint)
app.post('/api/tables/:tableId/clear', checkDb, resolveTenant, authenticateTenantAdmin, async (req, res) => {
  try {
    const tableId = req.params.tableId;
    const tabRef = db.collection(Table).doc(tableId);
    const tabDoc = await tabRef.get();
    if (!tabDoc.exists || tabDoc.data().restaurantId !== req.tenant._id) {
      return res.status(404).json({ message: 'Table not found' });
    }

    const ordersSnap = await db.collection(Order)
      .where('tableId', '==', tableId)
      .where('restaurantId', '==', req.tenant._id)
      .get();
      
    const batch = db.batch();
    ordersSnap.forEach(doc => {
      if (doc.data().status !== 'cancelled') {
        batch.update(doc.ref, { status: 'completed', paymentStatus: 'paid' });
      }
    });
    await batch.commit();

    const tableUpdate = {
      status: 'vacant',
      activeCart: [],
      verifiedMobileNumber: null
    };
    await tabRef.update(tableUpdate);
    const table = { _id: tableId, ...tabDoc.data(), ...tableUpdate };

    // Broadcast table clear to table room
    io.to(`room:table:${table._id}`).emit('table_cleared', {
      status: 'vacant',
      activeCart: [],
      verifiedMobileNumber: null
    });

    // Broadcast to admin room
    io.to(`room:restaurant:${req.tenant._id}:admin`).emit('table_status_change', {
      tableId: table._id,
      status: 'vacant',
      activeCart: [],
      verifiedMobileNumber: null
    });

    res.json({ message: 'Table cleared successfully', table });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Socket.io WebSocket Logic ---
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Handle client joining a table room (Multi-player customer view)
  socket.on('join_table', async ({ restaurantId, tableId }) => {
    const roomName = `room:table:${tableId}`;
    socket.join(roomName);
    console.log(`Socket ${socket.id} joined Table Room: ${roomName}`);

    if (!db) return;

    try {
      const tabDoc = await db.collection(Table).doc(tableId).get();
      if (tabDoc.exists && tabDoc.data().restaurantId === restaurantId) {
        const table = tabDoc.data();
        socket.emit('cart_sync', {
          activeCart: table.activeCart || [],
          status: table.status,
          verifiedMobileNumber: table.verifiedMobileNumber
        });
      }
    } catch (err) {
      console.error('Error fetching table details on join:', err);
    }
  });

  // Handle clients updating their shared cart
  socket.on('update_cart', async ({ restaurantId, tableId, cartItems }) => {
    const roomName = `room:table:${tableId}`;
    
    if (!db) return;

    try {
      const tabRef = db.collection(Table).doc(tableId);
      const tabDoc = await tabRef.get();
      if (tabDoc.exists && tabDoc.data().restaurantId === restaurantId) {
        const table = tabDoc.data();
        let status = table.status;
        if (table.status === 'vacant' && cartItems.length > 0) {
          status = 'occupied';
        } else if (table.status === 'occupied' && cartItems.length === 0) {
          status = 'vacant';
        }

        await tabRef.update({
          activeCart: cartItems,
          status: status
        });

        // Broadcast current cart to all other clients in the same table room
        socket.to(roomName).emit('cart_sync', {
          activeCart: cartItems,
          status: status,
          verifiedMobileNumber: table.verifiedMobileNumber
        });

        // Notify admin panel of table cart updates
        io.to(`room:restaurant:${restaurantId}:admin`).emit('table_status_change', {
          tableId,
          status: status,
          activeCart: cartItems,
          verifiedMobileNumber: table.verifiedMobileNumber
        });
      }
    } catch (err) {
      console.error('Error updating cart on socket update:', err);
    }
  });

  // Handle Admin joining a restaurant dashboard room
  socket.on('join_admin', ({ restaurantId }) => {
    const roomName = `room:restaurant:${restaurantId}:admin`;
    socket.join(roomName);
    console.log(`Socket ${socket.id} joined Admin Room: ${roomName}`);
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Backend Server running on port ${PORT}`);
});
