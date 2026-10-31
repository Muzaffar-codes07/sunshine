import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { WarrantyEquipment, WarrantyLookupQuery } from '@sunshine/contracts';
import { ApiError } from '../platform/api-error';

/** D3 adapter must join the unit to its installation, not infer ownership from tickets.
 * findBySerial returns at most two scoped matches so ambiguity is explicit. */
export abstract class WarrantyEquipmentReader {
  abstract findById(unitId: string): Promise<WarrantyEquipment | null>;
  abstract findBySerial(query: WarrantyLookupQuery): Promise<WarrantyEquipment[]>;
}

/** D2 adapter must authenticate and authorize staff BEFORE any serial lookup.
 * No request header or unverified request.user value constitutes authorization. */
export abstract class WarrantyLookupAccess {
  abstract assertCanLookup(request: Request): Promise<void>;
}

@Injectable()
export class UnavailableWarrantyEquipmentReader extends WarrantyEquipmentReader {
  async findById(_unitId: string): Promise<WarrantyEquipment | null> { return this.unavailable(); }
  async findBySerial(_query: WarrantyLookupQuery): Promise<WarrantyEquipment[]> { return this.unavailable(); }
  private unavailable(): never {
    throw new ApiError(503, 'WARRANTY_EQUIPMENT_UNAVAILABLE', 'Unit and installation lookup is awaiting inventory integration');
  }
}

@Injectable()
export class UnavailableWarrantyLookupAccess extends WarrantyLookupAccess {
  async assertCanLookup(_request: Request): Promise<void> {
    throw new ApiError(503, 'WARRANTY_AUTH_UNAVAILABLE', 'Warranty lookup is awaiting staff authorization integration');
  }
}
