# Catalogue and packages

Owner: **D2**. Read APIs, catalogue facts, and the disposable demonstration seed are implemented.

SALES and ADMIN sessions may read GET /api/v1/products, /products/:id,
/packages, and /packages/:id. Lists return active records and support bounded
pagination. Package filters are capacityKw (1–5) and systemType. Product
filters are kind, trackingMode, manufacturerId, and exact sku.

CatalogService.getProductFacts(tx, id) and getPackageFacts(tx, id) use the
caller's transaction and return validated DTOs. Unknown IDs return 404.
An incomplete BOM, inconsistent manufacturer/tracking facts, or a current kit
containing inactive products returns 503 CATALOGUE_DATA_INVALID.
Inactive revisions remain readable by ID for history. A new quote must check
the chosen revision is active and freeze its facts into its own snapshot.

Products use canonical UUID IDs and real Manufacturer UUID foreign keys.
Hardware is SERIALIZED or BULK; services are NONE/JOB and have no manufacturer.
Serialized products use PCS and require whole-number BOM quantities.
Inventory owns stock and acquisition costs; this module records sale prices.
Warranty policies and durations belong to the warranty module.

Packages retain a revision per capacity/system type. A partial unique index
allows one active revision for each pair. Hardware and installation prices are
separate Decimal(14,2) values; total is their exact sum. A complete kit contains
panels, inverter, charge controller, mounting, wiring box, switches/protection,
cable, earthing, and connectors. Off-Grid additionally requires a battery.
The charge controller follows the fictional PDF catalogue even for On-Grid.

See [catalogue handoff](../../../../docs/architecture/catalogue-handoff.md).
