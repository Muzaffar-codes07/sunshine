# Cross-review and remaining validation

Codex reviewed this folder on 31 October 2026 after Claude assembled it. Review covered all six research documents, the capability matrix and the source register. Architecture remains deferred.

## Corrections made

- Existing capabilities are not pitched as absent: Solar Ladder O&M and project costing, OpenSolar India/WhatsApp, and SolarBuddy maintenance scheduling/ticketing were checked against first-party pages.
- The matrix marks Solar Ladder phone-survey depth and order-triggered scheduling as partial, because generic forms/tasks do not establish those exact workflows. Zoho/Coperniq scheduling is also partial for the precise order-triggered requirement.
- Gap wording now separates a documented process problem from an unverified competitor capability. Old Odoo community material does not prove a current serial-warranty limitation.
- KPMG's 11% figure measures the reported influence of a journey stage on brand perception; it does not measure failure incidence or installer willingness to pay.
- Technician pay from hours is baseline R23, not a discretionary extra. No unverified claim about what judges will test is used.

## Capability-matrix source crosswalk

Source IDs refer to `sources/source-register.csv`. The matrix is a conservative screen for follow-up demos, not a product benchmark. Y means advertised, not verified execution; P means the exact automation/trigger or depth remains uncertain.

| Product column | Principal source IDs | Main limit |
|---|---|---|
| SolarBuddy | S14, S15, S16 | Public marketing, not a tested dispatch/service flow |
| Solar Ladder | S17, S18, S19; S20 only for 3P claims | Generic module coverage is not proof of all scene-level rules |
| Solar CRM Pro / Fuzen | S21 | Template offering; final configured behavior untested |
| Quickest | S22, S23 | Seller comparison supports some claims; test field-service depth |
| Arka360 | S25; S26 only as qualified competitor commentary | Survey/design coverage does not prove operations depth |
| OpenSolar | S27, S28, S29; S30 only for 3P claims | India adaptation is advertised; exact subsidy/service behavior unknown |
| Odoo Solar | S32, S33, S36 | Configuration assumptions depend on edition/version; C is not confirmed implementation |
| Zoho FSM | S37 | Asset/service capability is documented; end-to-end solar integration not tested |
| Coperniq | S40 | US-focused operations claims, not India-scheme support |
| Scoop Solar | S41 | Directory evidence only |

Some requirements are split across multiple matrix rows. For example R10 separates serial capture from mandatory pre-dispatch scanning, and R19 separates ticket existence from customer-confirmed closure. A Y on the first does not imply a Y on the second.

## Priority review

The proposed bet order is reasonable for a hackathon demonstration: an explained repair decision and explicit service scope directly connect the PDF to published support problems. It is not a proven ranking of buyer demand. Scope should be captured before a decision depends on it, even if the repair screen is demonstrated first. A next-owner queue addresses a broader portion of the lifecycle and is a credible alternative priority if the team values lead-to-installation completeness.

Keep the required baseline first. Test each bet on anonymized real cases before asserting commercial benefit. Suggested outcomes are time to find the responsible party, agreement between staff on coverage, ability to retrieve claim evidence and reconciliation of job costs. No numerical improvement is promised.

## Artifact checks

- Capability CSV: 34 data rows, all with 12 columns.
- Source register: 45 entries.
- Saved sources: 22 files; every registered `raw/` path exists.
- Saved pages are research reference copies. Inspect the register's read-depth and date caveats before using a claim.

These checks establish folder structure and traceability, not source truth, market completeness or software correctness.

## Still not performed

No buyer interviews, paid-product trials, switching/churn study, current final scheme-law verification, or willingness-to-pay test. No signup or outreach was performed. The folder is a bounded public-research deliverable with solution hypotheses; no implementation or new architecture work was done in this pass.
