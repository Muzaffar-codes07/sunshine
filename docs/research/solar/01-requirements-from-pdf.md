# Baseline requirements from the problem statement

These come from `sources/raw/problem-statement-solar.pdf`. **They are what we must build, not what makes us different.** Other files refer to them by ID.

The company in the PDF, SunPower Solutions, is fictional and isn't the real SunPower. Its pain is a brief, not market evidence.

| ID | Scene | Requirement |
|---|---|---|
| R1 | Rooftop inquiry | Web enquiry reaches sales straight away and never vanishes. WhatsApp and calls are also named as sources. |
| R2 | Rooftop inquiry | Phone check records shadow-free roof space, monthly bill and grid suitability |
| R3 | Rooftop inquiry | Technician survey records roof direction, tilt and cable distance |
| R4 | Rooftop inquiry | **No quote until the survey is approved** |
| R5 | Getting the kit right | Quote comes from a ready template (1-5 kW, On-Grid or Off-Grid) |
| R6 | Getting the kit right | Exact parts list follows automatically |
| R7 | Getting the kit right | Advance or full payment recorded before work starts |
| R8 | Getting the kit right | Confirmed order tells the warehouse what to pack |
| R9 | Getting the kit right | Crew sees the job on their schedule, with no phone call |
| R10 | Dispatch day | Every inverter, battery and charge controller is **scanned before leaving the warehouse** |
| R11 | Dispatch day | Each unit is linked to its customer |
| R12 | Dispatch day | **Warranty clock starts by itself on delivery,** per serial (for example 2 years for inverter or battery, 20 for panels) |
| R13 | On the roof | Phone or tablet form with start and finish times and confirmed system size |
| R14 | On the roof | Photos of the finished roof |
| R15 | On the roof | Homeowner signs on screen to accept |
| R16 | Rainy season | Support finds customer and inverter serial within seconds, with warranty status |
| R17 | Rainy season | Under warranty: costs the customer nothing |
| R18 | Rainy season | Out of warranty: parts and labour billed automatically |
| R19 | Rainy season | Ticket stays open **until the customer confirms it works** |
| R20 | Month-end | Which installations made or lost money, and what is unfinished |
| R21 | Month-end | Invoices to send |
| R22 | Month-end | Government subsidy paperwork tracked |
| R23 | Month-end | Technicians to pay, using their hours |
| R24 | Month-end | Today, this week and this month views, profit per job, open repairs |
| R25 | Month-end | Numbers can be shared |

## Ambiguities in the PDF

| Point | Our reading | Why |
|---|---|---|
| Panels have a 20-year clock but aren't on the scan list | Serialise panels too | The clock is per serial, and scheme documents also ask for module serials |
| A charge controller appears under On-Grid | Follow the PDF in seed data | It looks technically odd, but it is the catalogue we were given |
| Warranty starts on delivery | Follow the PDF, and record commissioning as a separate date | Real manufacturer and scheme rules may use other dates |
| "Under the subsidy" with Off-Grid systems | Don't offer subsidy on Off-Grid quotes | The official draft guidelines cover grid-connected systems |
