# Catalogue handoff

This documents the implemented D2 catalogue boundary. Inventory quantities,
actual acquisition costs, warranty policy, quote snapshots, and financial
postings belong to their respective modules.

## Read contracts

Authenticated SALES/ADMIN may use all routes below. WAREHOUSE may use product list/detail for stock receipts; package list/detail remain SALES/ADMIN.

| Route | Result |
| --- | --- |
| GET /api/v1/products | Active products; page/pageSize, kind, trackingMode, manufacturerId, exact sku |
| GET /api/v1/products/:id | Canonical product including manufacturer, tracking and unit of measure |
| GET /api/v1/packages | Current revisions; page/pageSize, capacityKw and systemType |
| GET /api/v1/packages/:id | Revision prices, installation service, and ordered complete hardware BOM |

Pagination starts at 1, defaults to 25, and has a maximum page size of 100.
IDs are UUIDs. Money and quantities are decimal strings. Responses use {data}.
Product manufacturerId and manufacturer.id identify the same Manufacturer
record; its name supplies the D3 manufacturer display string.

CatalogService is exported by CatalogModule. Its getProductFacts(tx, id)
and getPackageFacts(tx, id) helpers read through the caller's Prisma
transaction. X4 must validate that a chosen package is active, obtain an approved
latest survey, and freeze the package revision, product/manufacturer facts,
quantities and prices into the quote. This module does not mutate old quotes.

The shared.ts file is copied unchanged from D4 PR #8 at
ff18d802 so consumers share one money/quantity definition. Input commands may
use the command helpers introduced by the survey module.

## Disposable fixtures

After deploying migrations and building, explicitly opt in on a disposable
local database and run npm run seed:catalogue -w @sunshine/api with
DEMO_DATABASE_DISPOSABLE=true. It never runs on startup.
The operation inserts missing fixtures in one transaction and does not edit
existing product prices, package revisions, or BOM lines. A conflicting or
incomplete existing fixture causes rollback and requires manual review.

Fixtures contain one fictional manufacturer, 32 products, 10 complete packages
(1–5 kW, On-Grid and Off-Grid), and 95 hardware BOM lines. Reserved fixture UUIDs
begin c0010000-0000-4000-8000-; these are public example IDs.

The 1 kW On-Grid hardware/installation prices are INR 50000.00/5000.00.
The 3 kW On-Grid prices are INR 170000.00/10000.00. These match the demonstration
oracle. Other capacities and Off-Grid values are synthetic pre-tax examples.
A package price is charged once; component retail prices are not added to it.
The package's explicit installation price overrides the standalone service
product's catalogue price. No tax, subsidy, warranty duration, real equipment
sizing, actual cost, or reported profit is asserted by this seed.

## Database rules

Migration 20261031130000_catalogue adds Manufacturer, Product, Package and
PackageItem. Money is Decimal(14,2); BOM quantity is Decimal(12,3).
Foreign keys restrict deletion of referenced facts. Unique keys prevent duplicate
SKUs, codes, revision numbers, BOM products, or BOM positions.
Twelve CHECKs enforce identity text, tracking consistency, nonnegative finite
prices, supported capacity, positive revision, positive finite quantity, and
position. A partial unique index enforces one active revision per capacity/type.
Canonical PostgreSQL 17.11 definitions are in prisma/required-constraints.json.
Cross-row kit completeness and whole serialized quantities are checked when
facts are read and when the seed validates each template.
