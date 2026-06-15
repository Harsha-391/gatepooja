import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { Restaurant, Table, Category, MenuItem, Order, Otp } from './models.js';

dotenv.config();

// Initialize Firebase Admin
let db = null;
try {
  let credentials = null;

  try {
    credentials = JSON.parse(
      readFileSync(new URL('./firebase-service-account.json', import.meta.url))
    );
  } catch (e) {
    // JSON file not found or invalid
  }

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
    console.log('Firebase initialized for database clearing.');
  } else {
    throw new Error('No valid credentials provided in env or JSON file');
  }
} catch (err) {
  console.error('\n======================================================');
  console.error('FATAL: Could not initialize Firebase Admin for database clearing.', err.message);
  console.error('======================================================\n');
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
  console.log(`Cleared collection: ${collectionPath}`);
}

async function clearDb() {
  try {
    console.log('Clearing existing Firestore collections...');
    await deleteCollection(Restaurant);
    await deleteCollection(Table);
    await deleteCollection(Category);
    await deleteCollection(MenuItem);
    await deleteCollection(Order);
    await deleteCollection(Otp);
    console.log('\n--- DATABASE CLEARED SUCCESSFULLY ---');
    console.log('All seeded and user data has been wiped. You can now start fresh!');
    process.exit(0);
  } catch (error) {
    console.error('Error clearing database:', error);
    process.exit(1);
  }
}

clearDb();
