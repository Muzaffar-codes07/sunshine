import type { PrismaService } from '../platform/prisma.service';
import { demoProducts } from '../catalog/demo-catalogue';

// Requirement R12's example (2 years inverter/battery, 20 years panels) and the runbook's normal component duration.
const MONTHS: Record<string, number> = { PANEL: 240, INVERTER: 24, BATTERY: 24, CHARGE_CONTROLLER: 24 };
const LABELS: Record<string, string> = { PANEL: 'panel', INVERTER: 'inverter', BATTERY: 'battery', CHARGE_CONTROLLER: 'charge controller' };

export function demoWarrantyPolicies() {
  return demoProducts.flatMap((product) => {
    const durationMonths = MONTHS[product.category];
    if (product.trackingMode !== 'SERIALIZED' || !durationMonths) return [];
    return [{ productId: product.id!, policyName: `Demo ${LABELS[product.category]} component warranty`, revision: 'demo-v1', scope: 'Component replacement', durationMonths }];
  });
}

/** Insert-only, like the catalogue: a rerun never overwrites a term someone has changed. Needs the catalogue first. */
export async function seedWarrantyPolicies(prisma: PrismaService) {
  const policies = demoWarrantyPolicies();
  await prisma.productWarrantyPolicy.createMany({ data: policies, skipDuplicates: true });
  return { policies: policies.length };
}
