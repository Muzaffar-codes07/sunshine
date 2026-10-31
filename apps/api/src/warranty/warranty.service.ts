import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { warrantyAssessmentResultSchema, warrantyEquipmentSchema, warrantyLookupQuerySchema,
  warrantyLookupResponseSchema, type WarrantyAssessmentResult, type WarrantyEquipment,
  type WarrantyLookupQuery, type WarrantyLookupResponse } from '@sunshine/contracts';
import { ApiError } from '../platform/api-error';
import { WarrantyEquipmentReader } from './warranty-readers';
import { WarrantyReader, type SavedWarranty } from './warranty.repository';
import { normalizeWarrantyScope } from './warranty-scope';

@Injectable()
export class WarrantyService {
  constructor(private readonly equipment: WarrantyEquipmentReader, private readonly warranties: WarrantyReader) {}

  /** Without requestedScope this evaluates ONLY the scope named in the saved policy.
   * Repair orchestration must pass the actual scope; component cover does not imply free labour. */
  async evaluateWarranty(unitId: string, asOfDate: Date, requestedScope?: string): Promise<WarrantyAssessmentResult> {
    if (!z.uuid().safeParse(unitId).success) throw new ApiError(400, 'INVALID_INPUT', 'A valid unit ID is required');
    if (requestedScope !== undefined && typeof requestedScope !== 'string') {
      throw new ApiError(400, 'INVALID_INPUT', 'A valid requested scope string is required');
    }
    const date = istCalendarDate(asOfDate);
    const equipment = await this.equipment.findById(unitId);
    if (!equipment) throw new ApiError(404, 'UNIT_NOT_FOUND', 'No unit was found');
    if (equipment.unit.id !== unitId) throw new ApiError(503, 'INVALID_EQUIPMENT_RECORD', 'Unit lookup needs review');
    return this.assess(warrantyEquipmentSchema.parse(equipment), date, requestedScope);
  }

  async lookup(query: WarrantyLookupQuery, asOfDate: Date = new Date()): Promise<WarrantyLookupResponse> {
    const parsed = warrantyLookupQuerySchema.safeParse(query);
    if (!parsed.success) throw new ApiError(400, 'INVALID_INPUT', 'A valid serial and optional manufacturer/product IDs are required');
    const date = istCalendarDate(asOfDate);
    const matches = await this.equipment.findBySerial(parsed.data);
    if (matches.length === 0) throw new ApiError(404, 'UNIT_NOT_FOUND', 'No unit matches this serial');
    if (matches.length !== 1) throw new ApiError(409, 'AMBIGUOUS_SERIAL', 'Supply manufacturerId and productId to identify this serial');
    const equipment = warrantyEquipmentSchema.parse(matches[0]);
    if (equipment.unit.serial.trim().toUpperCase() !== parsed.data.serial ||
      (parsed.data.manufacturerId && equipment.unit.manufacturerId !== parsed.data.manufacturerId) ||
      (parsed.data.productId && equipment.unit.productId !== parsed.data.productId)) {
      throw new ApiError(503, 'INVALID_EQUIPMENT_RECORD', 'Serial lookup needs review');
    }
    return warrantyLookupResponseSchema.parse({ data: {
      ...equipment, assessment: await this.assess(equipment, date),
    } });
  }

  private async assess(equipment: WarrantyEquipment, date: string, requestedScope?: string): Promise<WarrantyAssessmentResult> {
    const warranty = await this.warranties.findByUnitId(equipment.unit.id);
    let coverageStatus: WarrantyAssessmentResult['coverageStatus'];
    let reason: string;
    const startDate = warranty ? savedCalendarDate(warranty.startDate) : null;
    const expiryDate = warranty ? savedCalendarDate(warranty.expiryDate) : null;
    if (warranty && (
      warranty.unitId !== equipment.unit.id || startDate! >= expiryDate! ||
      ![warranty.policyName, warranty.policyRevision, warranty.scope].every(
        (value) => typeof value === 'string' && value.trim().length > 0,
      )
    )) {
      throw new ApiError(503, 'INVALID_WARRANTY_RECORD', 'Saved warranty needs review');
    }
    if (!warranty) {
      coverageStatus = 'NO_WARRANTY'; reason = 'No warranty has been activated for this unit';
    } else if (!warranty.active) {
      coverageStatus = 'VOID'; reason = 'Warranty is void or inactive';
    } else if (date < startDate!) {
      coverageStatus = 'NOT_STARTED'; reason = `Warranty starts on ${startDate}`;
    } else if (date >= expiryDate!) {
      coverageStatus = 'EXPIRED'; reason = `Warranty expired on ${expiryDate}`;
    } else if (requestedScope != null && normalizeWarrantyScope(requestedScope) !== normalizeWarrantyScope(warranty.scope)) {
      coverageStatus = 'OUT_OF_SCOPE'; reason = `Requested work is outside saved warranty scope: ${warranty.scope}`;
    } else {
      coverageStatus = 'COVERED'; reason = 'Under active manufacturer/installer warranty';
    }
    const isCovered = coverageStatus === 'COVERED';
    return warrantyAssessmentResultSchema.parse({
      unitId: equipment.unit.id, serial: equipment.unit.serial, asOfDate: date,
      policyName: warranty?.policyName ?? null, policyRevision: warranty?.policyRevision ?? null,
      scope: warranty?.scope ?? null, startDate, expiryDate, coverageStatus, isCovered, reason,
      customerCharge: isCovered ? '0.00' : null,
      chargeStatus: isCovered ? 'FREE' : 'PENDING_ASSESSMENT',
    });
  }
}

/** Input is an occurrence instant; convert to Asia/Kolkata without host timezone dependence. */
function istCalendarDate(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new ApiError(400, 'INVALID_INPUT', 'A valid assessment instant is required');
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value;
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  if (!z.iso.date().safeParse(date).success) throw new ApiError(400, 'INVALID_INPUT', 'Assessment date is outside the supported calendar');
  return date;
}

/** Prisma DATE values encode calendar dates at UTC midnight; do not shift them to IST. */
function savedCalendarDate(value: SavedWarranty['startDate']): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()) ||
    value.toISOString().slice(10) !== 'T00:00:00.000Z') {
    throw new ApiError(503, 'INVALID_WARRANTY_RECORD', 'Saved warranty calendar dates need review');
  }
  return value.toISOString().slice(0, 10);
}
