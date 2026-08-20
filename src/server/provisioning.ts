import { randomUUID } from 'crypto';
import { adminDb, adminAuth } from '../lib/firebase-admin';
import { store } from './store';
import { Establishment, User, Category, MenuItem, Table, Subscription } from '../types';
import { hashPassword, registerUserPassword } from './users';
import { logger } from './logger';

export function slugify(text: string): string {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '') // remove leading/trailing hyphens
    .slice(0, 40) || 'mi-local';
}

export function generateUniqueSlug(baseName: string): string {
  const baseSlug = slugify(baseName);
  let slug = baseSlug;
  let counter = 2;

  while (store.getEstablishmentBySlug(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  return slug;
}

export interface ProvisionInput {
  firebaseUid?: string;
  email: string;
  password?: string;
  establishmentName: string;
  adminName?: string;
}

export async function provisionTenant(input: ProvisionInput): Promise<{ establishment: Establishment; user: User; subscription: Subscription }> {
  const { email, establishmentName, password, adminName } = input;
  const establishmentId = 'est-' + randomUUID();
  const slug = generateUniqueSlug(establishmentName);

  let uid = input.firebaseUid;
  if (!uid && password) {
    try {
      const fbUser = await adminAuth.createUser({
        email: email.trim().toLowerCase(),
        password,
        displayName: adminName || establishmentName.trim() + ' Admin',
      });
      uid = fbUser.uid;
    } catch (e) {
      logger.warn({ event: 'provision_firebase_auth_fallback', error: e });
      uid = 'usr-' + randomUUID();
    }
  } else if (!uid) {
    uid = 'usr-' + randomUUID();
  }

  if (password) {
    const pHash = hashPassword(password);
    registerUserPassword(email, pHash);
  }

  const establishment: Establishment = {
    id: establishmentId,
    name: establishmentName.trim(),
    slug,
    description: '',
    accentColor: '#f97316',
    logoUrl: null,
    kitchenToken: randomUUID(),
  };

  const user: User = {
    id: uid,
    establishmentId,
    email: email.trim().toLowerCase(),
    role: 'admin',
    name: adminName || (establishmentName.trim() + ' Admin'),
    active: true,
    createdAt: Date.now(),
  };

  const categoryId = 'cat-' + randomUUID();
  const category: Category = {
    id: categoryId,
    establishmentId,
    name: 'Bebidas',
    order: 1,
  };

  const menuItemId = 'item-' + randomUUID();
  const menuItem: MenuItem = {
    id: menuItemId,
    establishmentId,
    categoryId,
    name: 'Agua mineral',
    description: 'Agua mineral 500ml',
    price: 500,
    imageUrl: '',
    available: true,
  };

  const tableId = 'tab-' + randomUUID();
  const table: Table = {
    id: tableId,
    establishmentId,
    name: 'Mesa 1',
    active: true,
    capacity: 4,
    sessionToken: randomUUID(),
  };

  const subscription: Subscription = {
    id: 'sub-' + randomUUID(),
    establishmentId,
    planId: 'free',
    status: 'trialing',
    currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
    activatedManually: false,
  };

  // Write all records atomically to Firestore
  const batch = adminDb.batch();
  batch.set(adminDb.collection('establishments').doc(establishment.id), establishment);
  batch.set(adminDb.collection('users').doc(user.id), user);
  batch.set(adminDb.collection('categories').doc(category.id), category);
  batch.set(adminDb.collection('menuItems').doc(menuItem.id), menuItem);
  batch.set(adminDb.collection('tables').doc(table.id), table);
  batch.set(adminDb.collection('subscriptions').doc(subscription.id), subscription);

  await batch.commit();

  // Register into in-memory store
  store.registerProvisionedTenant({
    establishment,
    user,
    category,
    menuItem,
    table,
    subscription,
  });

  logger.info({ event: 'tenant_provisioned', establishmentId, slug, email: user.email });
  return { establishment, user, subscription };
}
