import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { Restaurant, Table, Category, MenuItem, Order, Otp } from './models.js';

dotenv.config();

// Initialize Firebase Admin
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
    db = getFirestore();
    console.log('Firebase initialized in seed script.');
  } else {
    throw new Error('No valid credentials provided in env or JSON file');
  }
} catch (err) {
  console.error('\n=================================================================================');
  console.error('FATAL: Could not initialize Firebase Admin for seeding.', err);
  console.error('=================================================================================\n');
  process.exit(1);
}

async function deleteCollection(collectionPath) {
  const collectionRef = db.collection(collectionPath);
  const snapshot = await collectionRef.get();
  
  if (snapshot.size === 0) return;

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();
}

async function seed() {
  try {
    console.log('Clearing existing Firestore collections...');
    await deleteCollection(Restaurant);
    await deleteCollection(Table);
    await deleteCollection(Category);
    await deleteCollection(MenuItem);
    await deleteCollection(Order);
    await deleteCollection(Otp);
    console.log('Database cleared!');

    console.log('Inserting seed data...');

    // 1. Create Restaurant
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const restRef = await db.collection(Restaurant).add({
      name: 'Bite of Italy',
      slug: 'bite-of-italy',
      adminUsername: 'admin@italy.com',
      adminPassword: hashedPassword,
      logo: '🍕',
      themeColor: '#e11d48', // rose-600
      createdAt: new Date().toISOString()
    });

    const restaurantId = restRef.id;
    console.log(`Created Restaurant: Bite of Italy (ID: ${restaurantId})`);

    // 2. Create Tables
    const tables = [];
    for (let i = 1; i <= 6; i++) {
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
    console.log(`Created ${tables.length} tables.`);

    // 3. Create Categories
    const categories = [];
    const categoryNames = ['Starters', 'Pizzas', 'Pastas', 'Desserts', 'Beverages'];
    
    for (let idx = 0; idx < categoryNames.length; idx++) {
      const name = categoryNames[idx];
      const catRef = await db.collection(Category).add({
        restaurantId: restaurantId,
        name,
        displayOrder: idx + 1
      });
      categories.push({ _id: catRef.id, name });
    }
    console.log(`Created ${categories.length} categories.`);

    // 4. Create Menu Items
    const startersId = categories.find(c => c.name === 'Starters')._id;
    const pizzasId = categories.find(c => c.name === 'Pizzas')._id;
    const pastasId = categories.find(c => c.name === 'Pastas')._id;
    const dessertsId = categories.find(c => c.name === 'Desserts')._id;
    const beveragesId = categories.find(c => c.name === 'Beverages')._id;

    const menuItems = [
      // Starters
      {
        restaurantId: restaurantId,
        categoryId: startersId,
        name: 'Garlic Bread with Cheese',
        description: 'Toasted French bread topped with garlic butter and melted mozzarella cheese.',
        price: 180,
        image: 'https://images.unsplash.com/photo-1573140247632-f8fd74997d5c?auto=format&fit=crop&w=600&q=80',
        isAvailable: true,
        options: [
          {
            name: 'Extra Topping',
            choices: [
              { name: 'Jalapenos', priceAdjustment: 30 },
              { name: 'Olives', priceAdjustment: 30 }
            ]
          }
        ]
      },
      {
        restaurantId: restaurantId,
        categoryId: startersId,
        name: 'Bruschetta Pomodoro',
        description: 'Grilled bread rubbed with garlic and topped with tomatoes, olive oil, and fresh basil.',
        price: 220,
        image: 'https://images.unsplash.com/photo-1572656631137-7935297eff55?auto=format&fit=crop&w=600&q=80',
        isAvailable: true,
        options: []
      },

      // Pizzas
      {
        restaurantId: restaurantId,
        categoryId: pizzasId,
        name: 'Margherita Pizza',
        description: 'Classic pizza topped with fresh tomato sauce, mozzarella cheese, and sweet basil leaves.',
        price: 299,
        image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=600&q=80',
        isAvailable: true,
        options: [
          {
            name: 'Size',
            choices: [
              { name: 'Regular', priceAdjustment: 0 },
              { name: 'Medium', priceAdjustment: 150 },
              { name: 'Large', priceAdjustment: 250 }
            ]
          },
          {
            name: 'Crust',
            choices: [
              { name: 'Classic Crust', priceAdjustment: 0 },
              { name: 'Wheat Crust', priceAdjustment: 40 },
              { name: 'Cheese Burst', priceAdjustment: 90 }
            ]
          }
        ]
      },
      {
        restaurantId: restaurantId,
        categoryId: pizzasId,
        name: 'Spicy Pepperoni Pizza',
        description: 'Spicy Italian pepperoni, mozzarella, and chili flakes on fresh tomato sauce base.',
        price: 449,
        image: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=600&q=80',
        isAvailable: true,
        options: [
          {
            name: 'Size',
            choices: [
              { name: 'Regular', priceAdjustment: 0 },
              { name: 'Medium', priceAdjustment: 180 },
              { name: 'Large', priceAdjustment: 290 }
            ]
          }
        ]
      },

      // Pastas
      {
        restaurantId: restaurantId,
        categoryId: pastasId,
        name: 'Penne Alfredo',
        description: 'Penne pasta tossed in rich, creamy parmesan cheese sauce with mushrooms.',
        price: 349,
        image: 'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?auto=format&fit=crop&w=600&q=80',
        isAvailable: true,
        options: [
          {
            name: 'Add Chicken',
            choices: [
              { name: 'No', priceAdjustment: 0 },
              { name: 'Yes', priceAdjustment: 80 }
            ]
          }
        ]
      },
      {
        restaurantId: restaurantId,
        categoryId: pastasId,
        name: 'Spaghetti Bolognese',
        description: 'Spaghetti pasta in a traditional slow-cooked rich minced beef and tomato sauce.',
        price: 399,
        image: 'https://images.unsplash.com/photo-1563379971899-660589a01cc3?auto=format&fit=crop&w=600&q=80',
        isAvailable: true,
        options: []
      },

      // Desserts
      {
        restaurantId: restaurantId,
        categoryId: dessertsId,
        name: 'Classic Tiramisu',
        description: 'Elegant espresso-soaked ladyfingers layered with whipped mascarpone cream.',
        price: 240,
        image: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=600&q=80',
        isAvailable: true,
        options: []
      },
      {
        restaurantId: restaurantId,
        categoryId: dessertsId,
        name: 'Chocolate Lava Cake',
        description: 'Warm chocolate cake with a luscious molten liquid chocolate center.',
        price: 199,
        image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=600&q=80',
        isAvailable: true,
        options: [
          {
            name: 'Add-on',
            choices: [
              { name: 'Vanilla Ice Cream', priceAdjustment: 50 }
            ]
          }
        ]
      },

      // Beverages
      {
        restaurantId: restaurantId,
        categoryId: beveragesId,
        name: 'Fresh Mint Mojito',
        description: 'Refreshing blend of fresh mint leaves, lime juice, sugar, and club soda.',
        price: 130,
        image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80',
        isAvailable: true,
        options: []
      },
      {
        restaurantId: restaurantId,
        categoryId: beveragesId,
        name: 'Iced Peach Tea',
        description: 'Chilled brewed black tea infused with sweet peach flavor and ice.',
        price: 110,
        image: 'https://images.unsplash.com/photo-1497534446932-c925b458314e?auto=format&fit=crop&w=600&q=80',
        isAvailable: true,
        options: []
      }
    ];

    const batch = db.batch();
    menuItems.forEach((item) => {
      const docRef = db.collection(MenuItem).doc();
      batch.set(docRef, { ...item, createdAt: new Date().toISOString() });
    });
    await batch.commit();
    console.log(`Created ${menuItems.length} menu items.`);

    console.log('\n--- SEED COMPLETE ---');
    console.log(`Test links for browser checking:`);
    console.log(`Restaurant ID: ${restaurantId}`);
    tables.forEach((t) => {
      console.log(`- ${t.tableNumber}: http://localhost:5173/r/${restaurantId}/t/${t._id}`);
    });
    console.log(`Admin Dashboard: http://localhost:5173/admin/${restaurantId}`);
    console.log('----------------------\n');

    process.exit(0);
  } catch (error) {
    console.error('Error during seeding:', error);
    process.exit(1);
  }
}

seed();
