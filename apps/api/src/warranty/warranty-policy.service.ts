import { Injectable } from '@nestjs/common';
import { productWarrantyPolicyResponseSchema, type SaveWarrantyPolicyInput, type WarrantyPolicy } from '@sunshine/contracts';
import { ApiError, refusal } from '../platform/api-error';
import { hashPayload, IdempotencyService } from '../platform/idempotency';
import { PrismaService } from '../platform/prisma.service';

const select = { policyName: true, revision: true, scope: true, durationMonths: true } as const;
const view = (productId: string, policy: WarrantyPolicy | null) => productWarrantyPolicyResponseSchema.parse({
  data: { productId, policy, fingerprint: policy ? hashPayload(policy) : null },
});
const changed = (code: string, reason: string, nextAction: string) => refusal({ code, reason, nextAction, source: 'WARRANTY' });

@Injectable()
export class WarrantyPolicyService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService) {}
  async get(productId: string) {
    productId = productId.toLowerCase();
    const product = await this.prisma.product.findUnique({ where: { id: productId }, include: { warrantyPolicy: { select } } });
    if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    return view(productId, product.warrantyPolicy);
  }
  async save(productId: string, input: SaveWarrantyPolicyInput, key: string, actorId: string) {
    productId = productId.toLowerCase();
    return this.idempotency.run({ actorId, key, action: 'WARRANTY_POLICY_SAVE', payload: { productId, ...input } }, async tx => {
      // The product lock also serializes first-time creation, when no policy row exists to lock yet.
      await tx.$queryRaw`SELECT "id" FROM "products" WHERE "id"=${productId}::uuid FOR UPDATE`;
      const product = await tx.product.findUnique({ where: { id: productId }, include: { warrantyPolicy: { select } } });
      if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
      if (!product.active || product.kind !== 'HARDWARE' || product.trackingMode !== 'SERIALIZED') {
        throw changed('POLICY_PRODUCT_INVALID', 'Warranty terms require an active serialized hardware product.', 'Select a supported equipment product.');
      }
      const { expectedFingerprint, ...policy } = input;
      const previous = product.warrantyPolicy;
      if ((previous ? hashPayload(previous) : null) !== expectedFingerprint) {
        throw changed('STALE_POLICY', 'These warranty terms changed while you were editing.', 'Reload the saved policy before applying your change.');
      }
      if (previous && hashPayload(previous) !== hashPayload(policy) && policy.revision === previous.revision) {
        throw changed('POLICY_REVISION_REQUIRED', 'Changed warranty terms require a new revision.', 'Enter a new revision so future quotes can identify the changed terms.');
      }
      await tx.productWarrantyPolicy.upsert({ where: { productId }, create: { productId, ...policy }, update: policy });
      return view(productId, policy);
    });
  }
}
