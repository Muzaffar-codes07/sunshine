# Existing products

This is a researched shortlist, not every product on the market. We tested none of them. Everything here is what vendors describe unless stated otherwise, and unsupported performance figures (such as "4x faster") are left out on purpose. Sources are in `sources/source-register.csv`, and the feature-by-feature view is in `03-capability-matrix.csv`.

**Main finding: the closest rivals already claim most of the PDF.** SolarBuddy and Solar Ladder come nearest, and both are Indian. We shouldn't pitch integration or features alone as new.

## Closest rivals: Indian operations platforms

### SolarBuddy
- **For:** Indian EPC contractors and installers.
- **Claims:** leads from calls, WhatsApp and IndiaMART; survey inputs; subsidy-aware PDF quotes on WhatsApp; 70:30 GST invoices with Tally export; 10-milestone projects with a "DISCOM radar" for files stuck past 30 days and an escalation notice generator; multi-godown stock; phone-camera serial scanning; BOM auto-deduction; ALMM and DCR tracking by serial batch; digital warranty certificates; AMC scheduling; homeowner fault tickets with photos; customer portal.
- **Closest thing to our product.** It describes nearly every scene.
- **What the pages don't show:** a hard quote gate after survey approval, automatic free-or-billed decisions, profit per job, technician pay, and on-screen customer sign-off. Its home page describes scanning "at installation", while the PDF requires scanning before dispatch; its inventory page mentions gate passes and delivery OTPs.
- **Caution:** its scale and speed figures are unverified. I couldn't confirm its 12% GST rate as current (see `04-pain-and-evidence.md`).

### Solar Ladder
- **For:** Indian rooftop EPCs. Claims 600+ companies, and has reported seed funding of about $1.3 million.
- **Claims:** projects, CRM, proposals, design, tasks, project management, site surveys and forms, O&M, customer dashboard, procurement, finance. Its Books module covers inventory, costing, expenses and invoicing, and says it calculates "true profits" per project.
- **Strongest claim against us:** job profit is already offered. Do not repeat its "industry-first" wording as fact.
- **What the pages don't show:** serial-level warranty, coverage decisions, or whether repair costs go back to the original job.

### Solar CRM Pro (Fuzen, previously surfaced as "Solarflow")
- **For:** Indian installers. A one-time template price of ₹59,000 plus GST, with AI customisation.
- **Claims:** leads, phone survey form, subsidy-aware quotes, 10-step milestones with photos, milestone payments and GST invoices, PM Surya Ghar tracker with stuck-file alerts past 45 days, loan tracking, inventory, AMC and service tickets, role-based dashboards. WhatsApp automation and GPS attendance are in a higher tier.
- **What the pages don't show:** serial numbers, warranty clocks, or job profit.

### Quickest Solar CRM
- **For:** Indian sales teams of 3-25 people. Free plan, with Pro at ₹6,999 per user a year.
- **Claims:** leads, phone proposals, BOM with GST and subsidy, seven solar pipeline stages including net metering, WhatsApp follow-up, sales reports. Mentions service visits and warranty claims as a stage.
- **Sales-focused.** Its publisher tells buyers to test field installation and support themselves.

### Solset CRM
- **Claims:** free project management, BOM and purchase orders, goods receipts and GST invoicing (from a Product Hunt listing only).

## Design-first products

| Product | Claims | Note |
|---|---|---|
| **Arka360** | Lead management, design, proposals, shade analysis, site surveys, permit packages, dashboards | Indian design roots with a built-in CRM. A competitor calls its engineering light. |
| **OpenSolar** | Free design, proposals and project CRM. Its India page covers WhatsApp sharing, elevated RCC structures and 3D proposals. Its homepage lists Auto BOM and CashFlow (Codex checked). | Not design-only and is adapted for India. Funded by partners rather than installers. A competitor says subsidy and ALMM handling is manual. |
| **Aurora** | Roof design, performance modelling, proposals, integrations | Avoid competing on design. |
| **Reslink** | On-site mobile design, quotes, drawings, subsidy calculation | Seller of the detailed PM Surya Ghar guide we used. |

## Configurable platforms

### Odoo Solar
- **Most relevant to this event's judges.**
- **Claims:** website leads, automated installation tasks on sale, Gantt scheduling, mobile field service, worksheets, timesheets, spare parts invoicing, helpdesk. The `solar_installation` module is a configuration of Enterprise apps, including Field Service, Helpdesk, Repairs, Inventory and Studio.
- **Current serial-warranty depth is unverified:** an old OCA add-on and forum answers discuss missing fields or lot-expiry workarounds. They do not establish a limitation in today's edition; verify the actual version before making that claim.
- **Subsidy:** the industry page doesn't mention PM Surya Ghar.

### ERPNext
- SolarSquare, an Indian rooftop brand, reportedly runs ERPNext for 400+ users across supply chain, finance and warehouse. A large player choosing a custom ERP base is a useful signal, but we saw only summaries of this.

### Zoho FSM
- **Claims:** customer assets with history, child components with their own warranty expiry, and recurring maintenance plans. Staff "make service decisions" based on purchase date and warranty.
- **Not solar-specific.** The closest match for asset-based service.

## US-focused operations platforms

| Product | Claims | Note |
|---|---|---|
| **Coperniq** | Workflows from survey to PTO, work orders, contracts with signatures, service dispatch, hardware-triggered tickets, client portal. A page mentions linking systems, jobs and warranties. | Most advanced after-sales story seen. US market, no PM Surya Ghar shown. |
| **Scoop Solar** | Project management, mobile forms with offline access, subcontractors (directory listings) | Hub connecting other tools |
| **Fieldproxy** | Surveys, installs, O&M, plain-English configuration, AI agents | Solar positioning, with no India scheme claims read |
| **Sunbase, Enerflo** | Solar CRM and sales platforms | Thin evidence, and Sunbase is also a biased source about rivals |

## What this means

1. **Features alone won't differentiate us.** Lead-to-ticket coverage is claimed by several rivals.
2. **We are competing on depth and correctness.** Whether a rule is really enforced can't be judged from landing pages, and a demo can show it.
3. **The incumbent may really be Excel and WhatsApp.** Sellers say so, which is also what the PDF describes, but we have no adoption data.
