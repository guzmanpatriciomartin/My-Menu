import { store } from './store';
import { PLANS } from './plans';

export function checkPlanLimit(eid: string, resource: 'tables' | 'menuItems' | 'users'): void {
  const sub = store.getSubscription(eid);
  const planId = sub?.planId || 'free';
  const plan = PLANS[planId] || PLANS.free;

  if (resource === 'tables') {
    if (plan.maxTables !== -1) {
      const currentCount = store.getTables(eid).filter((t) => t.active).length;
      if (currentCount >= plan.maxTables) {
        throw new Error('PLAN_LIMIT_EXCEEDED');
      }
    }
  } else if (resource === 'menuItems') {
    if (plan.maxMenuItems !== -1) {
      const currentCount = store.getMenuItems(eid).length;
      if (currentCount >= plan.maxMenuItems) {
        throw new Error('PLAN_LIMIT_EXCEEDED');
      }
    }
  } else if (resource === 'users') {
    if (plan.maxUsers !== -1) {
      const currentCount = store.getUsersByEstablishment(eid).filter((u) => u.active).length;
      if (currentCount >= plan.maxUsers) {
        throw new Error('PLAN_LIMIT_EXCEEDED');
      }
    }
  }
}
