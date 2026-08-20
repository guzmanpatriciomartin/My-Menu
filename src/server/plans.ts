import { Plan } from '../types.js';

export const PLANS: Record<'free' | 'pro', Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    maxTables: 2,
    maxMenuItems: 20,
    maxUsers: 2,
    priceARS: 0,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    maxTables: -1,
    maxMenuItems: -1,
    maxUsers: -1,
    priceARS: 15000,
  },
};
