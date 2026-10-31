import { Prisma, type ProductCategory, type ProductTrackingMode, type UnitOfMeasure } from '../generated/prisma/client';

// Explicit RFC-shaped v4 fixture IDs; public catalogue examples, not security tokens.
export function catalogueDemoId(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 999999999999) throw new Error('Invalid demo fixture identifier');
  return `c0010000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}
export const demoManufacturer = { id: catalogueDemoId(1), name: 'Demo Solar Manufacturer (fictional)' };
const decimal = (value: string) => new Prisma.Decimal(value);
function hardware(id: number, sku: string, name: string, category: ProductCategory, trackingMode: ProductTrackingMode, unitOfMeasure: UnitOfMeasure, price: string): Prisma.ProductUncheckedCreateInput {
  return { id: catalogueDemoId(id), sku, name: `Demo ${name}`, category, kind: 'HARDWARE', trackingMode, unitOfMeasure, manufacturerId: demoManufacturer.id, unitSalePrice: decimal(price), active: true };
}
export const demoProducts: Prisma.ProductUncheckedCreateInput[] = [
  hardware(100, 'DEMO-PANEL-500W', '500 W panel', 'PANEL', 'SERIALIZED', 'PCS', '12000.00'),
  hardware(101, 'DEMO-WIRING-BOX', 'wiring box set', 'WIRING_BOX', 'BULK', 'SET', '1000.00'),
  hardware(102, 'DEMO-SWITCH-SET', 'switch and protection set', 'SWITCHGEAR', 'BULK', 'SET', '1000.00'),
  hardware(103, 'DEMO-CABLE-M', 'cable per metre', 'CABLE', 'BULK', 'M', '150.00'),
  hardware(104, 'DEMO-EARTHING-SET', 'safety earthing set', 'EARTHING', 'BULK', 'SET', '2000.00'),
  hardware(105, 'DEMO-CONNECTOR-SET', 'panel connector set', 'CONNECTOR', 'BULK', 'SET', '500.00'),
  { id: catalogueDemoId(106), sku: 'DEMO-INSTALLATION', name: 'Demo installation and testing service', kind: 'SERVICE', category: 'INSTALLATION', trackingMode: 'NONE', unitOfMeasure: 'JOB', manufacturerId: null, unitSalePrice: decimal('5000.00'), active: true },
];
const hardwarePrices = ['50000.00', '107500.00', '170000.00', '218000.00', '270000.00'];
const installationPrices = ['5000.00', '7500.00', '10000.00', '12000.00', '15000.00'];
export const demoPackages: { data: Prisma.PackageUncheckedCreateInput; items: Prisma.PackageItemUncheckedCreateInput[] }[] = [];
for (let capacity = 1; capacity <= 5; capacity++) {
  demoProducts.push(
    hardware(200 + capacity, `DEMO-INV-ON-${capacity}KW`, `${capacity} kW On-Grid inverter`, 'INVERTER', 'SERIALIZED', 'PCS', decimal('17000.00').mul(capacity).toFixed(2)),
    hardware(300 + capacity, `DEMO-INV-OFF-${capacity}KW`, `${capacity} kW Off-Grid inverter`, 'INVERTER', 'SERIALIZED', 'PCS', decimal('22000.00').mul(capacity).toFixed(2)),
    hardware(400 + capacity, `DEMO-CTRL-${capacity}KW`, `charge controller for ${capacity} kW fictional kit`, 'CHARGE_CONTROLLER', 'SERIALIZED', 'PCS', decimal('4000.00').mul(capacity).toFixed(2)),
    hardware(500 + capacity, `DEMO-BAT-${capacity}KW-KIT`, `backup battery for ${capacity} kW kit`, 'BATTERY', 'SERIALIZED', 'PCS', decimal('20000.00').mul(capacity).toFixed(2)),
    hardware(600 + capacity, `DEMO-MOUNT-${capacity}KW`, `mounting stands for ${capacity} kW kit`, 'MOUNTING', 'BULK', 'SET', decimal('3000.00').mul(capacity).toFixed(2)),
  );
  for (const systemType of ['ON_GRID', 'OFF_GRID'] as const) {
    const offGrid = systemType === 'OFF_GRID';
    const number = (offGrid ? 2000 : 1000) + capacity;
    const id = catalogueDemoId(number);
    const hardwarePrice = decimal(hardwarePrices[capacity - 1]!);
    const data: Prisma.PackageUncheckedCreateInput = {
      id, code: `DEMO-${systemType}-${capacity}KW-R1`, name: `Demo ${capacity} kW ${offGrid ? 'Off-Grid' : 'On-Grid'} kit, revision 1`,
      capacityKw: capacity, systemType, revision: 1, active: true,
      hardwarePrice: offGrid ? hardwarePrice.add(decimal('25000.00').mul(capacity)) : hardwarePrice,
      installationPrice: decimal(installationPrices[capacity - 1]!), installationProductId: catalogueDemoId(106),
    };
    const lines: [number, string][] = [[100, `${capacity * 2}.000`], [(offGrid ? 300 : 200) + capacity, '1.000'], [400 + capacity, '1.000'], [600 + capacity, '1.000'], [101, '1.000'], [102, '1.000'], [103, `${10 * (capacity + 1)}.000`], [104, '1.000'], [105, `${capacity}.000`]];
    if (offGrid) lines.push([500 + capacity, '1.000']);
    demoPackages.push({ data, items: lines.map(([product, quantity], index) => ({ id: catalogueDemoId(number * 100 + index + 1), packageId: id, productId: catalogueDemoId(product), quantity: decimal(quantity), position: index + 1 })) });
  }
}
