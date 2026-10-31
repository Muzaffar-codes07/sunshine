# Proposed architectures: Solar and Wedding

Written by Claude on 2026-10-31, before reading any Codex architecture. Design only: nothing here is built, tested or approved. "New" means new compared with what our sources show. We can't see competitors' internals, so don't claim these are unique.

## The core idea, for both

Most of the pain is about being unable to answer "what was agreed, what happened and who owes what?" later on. So the system of record is **append-only facts**, and every status, balance or profit figure is **calculated from them**.

```
 Phone / web
     |  command with a client-made ID (safe to retry)
     v
 Rule check ---- rejected, with the reason
     |  passes
     v
 One database transaction
   - append facts (stock, asset, money, events)
   - add side effects to an outbox table
     |                         |
     v                         v
 Calculated views          Outbox worker
 (status, balance,         (notifications, PDFs,
  profit, dashboards)       handover packs)
```

**Shared decisions**

| Decision | Choice | Why |
|---|---|---|
| Deployment | One modular app with Postgres | A team of four in 24h can't run microservices |
| Stack, unless Odoo is mandatory | NestJS, Prisma, Postgres, React | The team has used it in StockSense |
| Correcting mistakes | Add a reversing fact, never edit | Keeps the audit trail. StockSense already does this for stock. |
| Retries | Unique client-made operation ID on each command | A double tap or a retry can't apply twice |
| Time | Rules read an injected clock, with a visible demo override | "18 months later" can be shown without faking data |
| Offline | Phone queues commands and replays them. The server decides. | [CRDT merges don't check business rules](https://omr.it.com/blog/offline-first-state-sync-crdts-production/), and these actions have strict ones |
| Live updates | Server-sent events, falling back to polling | One-way updates are enough here |

**If Odoo is mandatory:** keep the domain rules, and map them onto Odoo's stock, lots, helpdesk, purchase and project records in a custom add-on. I haven't verified that mapping, so re-plan before building.

## Solar: Asset and Obligation Ledger

**The gaps it addresses:** who pays for a repair and why, records the customer keeps, and profit over a job's whole life. Serial scanning itself already exists elsewhere, so it isn't the pitch.

### Components

| Component | Job | Key rule | Build |
|---|---|---|---|
| Job workflow gate | Moves a job from lead to closed | No quote until the survey is approved. Each step lists the evidence it needs. | Must |
| Kit resolver | Turns "3 kW On-Grid" into a parts list | The BoM version is frozen on the order, so later edits don't change old jobs | Must |
| Stock ledger | Quantities by location | Append-only, with on-hand calculated. Same design as StockSense. | Must |
| Asset ledger | One timeline per serial | received → allocated → dispatched → delivered → installed → replaced or returned | Must |
| Coverage engine | Decides who pays | See below | Must (simple form) |
| Field capture | Phone form, photos, signature | Works offline. Sign-off fixes a hash of the job summary. | Must |
| Service tickets | Fault to confirmed fix | Can't close until the customer confirms | Must |
| Job money ledger | Every rupee tagged to a job | Separate views for profit, cash and subsidy | Must |
| Handover pack | The customer's own record | Self-contained PDF or JSON | Should |
| Subsidy tracker | Stage, next owner, days waiting | Checklist only, values configurable | Should |

### The asset ledger

```
asset_event (append-only)
  id, serial, product_id, type, job_id, customer_id, location_id,
  occurred_at, recorded_by, operation_id (unique), replaces_serial

Only one active allocation per serial, enforced by the database:
  partial unique index on asset_current(serial) where status is allocated or dispatched
```

A replacement inverter is a new asset linked to the old one, so support sees the full history and a new warranty question is answered correctly.

### The coverage engine

A pure function, with no hidden state:

```
decide(asset, ticket_type, as_of, policy_version)
  -> { customer_pays: yes or no, who_absorbs_cost, reason, rule_id, dates_used }
```

```
Fault on serial X, as_of = today
  |
  +-- Is it a bill or net-meter issue?  -> Not a fault; route to DISCOM follow-up
  +-- Component warranty still active?  -> Free to customer; supplier claim
  +-- Service cover active on this job? -> Free to customer; company absorbs cost
  +-- Otherwise                         -> Parts and labour billed
```

- **The decision is saved on the ticket** with its reason and rule version, so it can be explained later even if policies change.
- **Rules are data.** Durations and service cover are configurable. The 5-year scheme rule is a policy row, off by default until checked against the final MNRE text.
- **Boundary dates are tested,** including the last day of cover and the day after.

### Money ledger

```
money_entry (append-only)
  job_id, kind, amount, occurred_at, source_id (unique per kind)

kind: revenue, customer_receipt, subsidy_expected, subsidy_received,
      material_cost, labour_cost, repair_cost, repair_billed
```

- **Profit** = revenue + repair_billed − material − labour − repair cost
- **Cash** = receipts − payments made
- **Subsidy** = expected vs received, shown apart from profit
- **Material cost** comes from the serial or batch actually dispatched
- **A repair at month 18 lands on the original job,** so its margin changes. The dashboard shows it. This is the demo's strongest reporting moment.

### Handover pack

A PDF or JSON file with serials, install date, warranty dates, service terms, photos and signature hash. Its QR code holds the data itself, or a summary, rather than only a link, so it stays useful if the company's server goes away. It doesn't guarantee repairs and must not say so.

### Failure handling

| Failure | Response |
|---|---|
| Same serial scanned on two jobs | The database index rejects the second, and the screen names the first job |
| Technician has no signal on the roof | Form saves locally, shows "not yet synced", replays with the same ID |
| Offline form conflicts with a server change | The server rejects it and the office sees a review item. Nothing is silently merged. |
| Dispatch retried after a timeout | Same operation ID returns the earlier result |
| Camera or HTTPS unavailable | Typed serial entry |

## Wedding: Commitment and Variation Ledger

**The gaps it addresses:** extras tied to both vendor cost and client price, margin at each stage, knock-on delays, and couples seeing that vendors were paid. Basic budgets and payment tracking exist elsewhere, so they aren't the pitch.

### Components

| Component | Job | Key rule | Build |
|---|---|---|---|
| Enquiry and agreement gate | First contact to signed agreement | Vendor lists stay hidden until signed | Must |
| Quote normaliser | Puts vendor quotes into one format | Keeps the original PDF attached. People enter the lines; extraction is optional. | Must |
| Award | Picks one winner | Atomic: exactly one winner, others closed, vendor linked | Must |
| Plan generator | Creates the 25+ task plan on deposit | Template version plus functions. Runs once per deposit. | Must |
| Commitment ledger | What was agreed | The awarded quote is frozen | Must |
| Variation log | Extras with approval | One entry holds both vendor cost and client price | Must |
| Bill matching and payments | Pays the right balance | See below | Must |
| Run-of-show | Live schedule | See below | Must |
| Margin views | Three stages per wedding, rolled up by season | Ties back to wedding detail | Must |
| Client statement | What the couple can see | Their own wedding only | Should |

### Comparing quotes as cost functions

Each quote is stored as a formula rather than a single total:

```
total(guests, extra_hours) =
    fixed + per_plate × max(guests, minimum_guests)
          + hourly_rate × extra_hours + sum(required extras)
```

So the planner can compare at 400 guests **and** at 460. A caterer who is cheapest at 400 can be dearer at 460 because of its overage rate. It also shows what's missing: a line one vendor included and another didn't is flagged rather than assumed free. All numbers in a demo must be clearly sample data.

### Money flow

```
Agreed amount (frozen)
  + approved variations
  = expected payable
  - advances already paid
  = remaining balance
```

- **Bills** are matched line by line against the commitment and variations. Differences go to review.
- **Duplicates:** a unique index on vendor, bill reference and wedding blocks the same bill twice. Payments use operation IDs.
- **Variation example:** "60 extra plates" records vendor cost and client charge together, with who approved it. Margin moves immediately.

**Margin has three stages, never mixed:**

| Stage | Revenue | Cost |
|---|---|---|
| Estimated | Package price | Budget |
| Committed | Agreed price plus approved extras | Awarded quotes plus variations |
| Actual | Invoiced | Matched bills plus team hours at a stated rate |

Cash received and cash due are shown separately.

### Run-of-show

```
schedule_item: function, title, planned_start, duration, owner, vendor_id, depends_on[]
arrival_event: vendor_id, wedding_id, expected_at, arrived_at (append-only)
incident:      item_id, description, owner, opened_at, resolved_at
```

- **Lateness detection:** a timer compares the clock with expected arrivals and raises an alert once the grace period passes, without anyone reporting it.
- **Knock-on warnings:** dependencies show that if the DJ is 30 minutes late, the Sangeet opening is at risk, and who owns it.
- **Suggest, don't reschedule.** The system warns and a person decides, because families and venues can't be moved by software.
- **Offline:** read the last-synced schedule and queue check-ins. This matters at venues, but it's the hardest part in 24h, so full offline is a stretch.

### Failure handling

| Failure | Response |
|---|---|
| Two planners award different vendors | A unique index allows one winner per request. The second gets an error. |
| Deposit marked twice | The plan generator is keyed on the deposit, so it runs once |
| Same bill entered twice | Blocked and flagged |
| Venue has no signal | Last-synced schedule stays readable, and check-ins queue |
| Couple tries another wedding's link | Access is scoped to their wedding on the server |

## Comparison

| | Solar | Wedding |
|---|---|---|
| New components beyond a standard CRUD app | Asset ledger, coverage engine, offline form, money ledger | Quote formula, variation log, run-of-show timer, money ledger |
| Must-have components | 8 | 8 |
| Reused from StockSense, if allowed | Auth, RBAC, warehouses, stock ledger | Auth, RBAC only |
| Live or real-time need | Low | High on the wedding day |
| Hardest part | Keeping stock, assets and money consistent | Making the live day feel real |
| Biggest demo risk | Time jump looks staged | Live screen needs events to arrive during the demo |

## Testing what matters

**Solar**
- No quote before survey approval.
- One serial can't be allocated twice.
- Coverage is correct on boundary dates.
- Replacement history stays linked.
- Repair cost lands on the original job.
- Dashboard totals equal the job totals.

**Wedding**
- Exactly one winner per request.
- One plan per deposit.
- Advances are deducted once.
- 60 extra plates change both cost and client charge correctly.
- A couple can't read another wedding.
- Season totals equal the wedding totals.

## What this doesn't solve

- **Adoption.** If technicians or planners won't use it, the architecture doesn't help, and we have no user evidence on this.
- **Government and supplier systems.** No live integration. Subsidy tracking depends on someone entering the status.
- **Legal strength of signatures.** On-screen signing is acceptance evidence only. We haven't checked it against Indian e-signature law.
- **Scale.** Fine for this size of business. Not load-tested.
