# Hackathon requirements review

Reviewed 31 October 2026, 14:50 IST. This review separates what the organizers actually state from what the team chose for itself.

## Sources

| Key | Source | How read | Authority |
|---|---|---|---|
| **EV** | Event page `https://hackathon.odoo.com/hackathon/details/69158` ("Odoo x GCET Hyderabad Hackathon 2026") | Two screenshots taken by the team leader while signed in, captured 31 Oct 2026 around 14:40 IST: (1) header, timeline, team and problem statements; (2) evaluator, venue, "About Challenge" and the full "Must have / Nice to have" cards. They are kept privately and not committed because they show account, team and evaluator details. The page sits behind a GitHub login and could not be read by an automated fetch. Content below the "Must have / Nice to have" cards was not captured. | Organizer, current event |
| **VID** | [organizer-video-deliverables.md](organizer-video-deliverables.md) | Transcript of the 2025 organizer video | Organizer, but a 2025 general briefing, not this event's page |
| **PDF** | [solar-problem-statement.pdf](solar-problem-statement.pdf) | Full text, 4 pages | Organizer, the selected problem statement |

The event page lists two problem statements: *Solar Installation Management System* and *Wedding Planning Management System*. The team's selected statement shown on the portal is **Solar Installation Management System**.

## Requirements

**MUST** means the organizers state it as required: an EV "Must have" item, a portal milestone, or a PDF scene requirement. **SHOULD** means an EV "Nice to have" item, or a VID statement that the current event page does not repeat. **OPTIONAL** means the organizers allow it but do not ask for it.

### Engineering and presentation

| # | Requirement | Tag | Source | Note |
|---|---|---|---|---|
| E1 | Use real-time or dynamic data. Static JSON only for initial prototyping, not the final solution | MUST | EV must-have; VID 3.2 | |
| E2 | Responsive, clean UI with a consistent colour scheme and layout | MUST | EV must-have; VID 3.5 | EV adds "responsive"; VID does not |
| E3 | Robust input validation | MUST | EV must-have; VID 3.3 | VID example: an invalid email gets a clear message |
| E4 | Intuitive navigation with proper menu placement and spacing | MUST | EV must-have; VID 3.5 | |
| E5 | Proper use of Git; one member managing the repository is not enough | MUST | EV must-have; VID 3.4 | Each of the four members needs their own commits |
| E6 | Design backend APIs, model the data and set up a local database | SHOULD | EV nice-to-have | VID 3.1 presents this as a hard requirement; the team has adopted it as mandatory (decision ADR-03) |
| E7 | Do not rely on Backend-as-a-Service (Firebase, Supabase, MongoDB Atlas); local MySQL or PostgreSQL | SHOULD | VID 3.1 | Not on the EV page as captured. Team-adopted (ADR-03) |
| E8 | Understand AI-generated code and snippets before using them; no blind copy-paste | SHOULD | EV nice-to-have; VID 3.6 | Every member must be able to explain their code |
| E9 | Plan for offline or local operation; don't rely entirely on internet connectivity or cloud tools | SHOULD | EV nice-to-have | A local Compose deployment covers "local". Offline browser sync is not required |
| E10 | Use trendy technology (AI, blockchain, chatbots) only if it adds real value | OPTIONAL | EV nice-to-have; VID 3.6 | |
| E11 | Minimal third-party APIs; build from scratch | SHOULD | VID 3.1 | Not on the EV page as captured |
| E12 | Whole-team presentation where everyone participates | SHOULD | VID 2 | EV shows a presentation milestone but no format rules were captured |
| E13 | Evaluation: coding standard, logic, modularity, front-end design, performance, scalability, security, usability, debugging; database design called most important | SHOULD | VID 4 | Not on the EV page as captured. Treat as likely judging focus, not a published rubric |

### Functional (PDF)

Each of these is a **MUST** from the PDF. The repository's [traceability matrix](../planning/requirements-traceability.csv) splits them into R1–R25.

| # | PDF scene | Requirement | Rows |
|---|---|---|---|
| F1 | The rooftop inquiry | Web enquiry with name, phone, address and needs lands with sales immediately and never vanishes | R1 |
| F2 | The rooftop inquiry | Qualification call records shadow-free roof space, monthly bill and grid suitability | R2 |
| F3 | The rooftop inquiry | Technician survey records roof direction, tilt and cable distance | R3 |
| F4 | The rooftop inquiry | Quote is sent only after the survey is approved | R4 |
| F5 | Getting the kit right | Quote comes from a ready template (1–5 kW, On-Grid / Off-Grid) and the complete parts list follows automatically | R5, R6 |
| F6 | Getting the kit right | Advance or full payment recorded before work starts | R7 |
| F7 | Getting the kit right | Confirmed order tells the warehouse what to pack and puts the job on the crew schedule, with no phone calls | R8, R9 |
| F8 | Dispatch day | Every inverter, battery and charge controller is scanned before leaving the warehouse; each unit is linked to its customer | R10, R11 |
| F9 | Dispatch day | Delivery starts each serial's warranty automatically (example: 2 years inverter/battery, 20 years panels) | R12 |
| F10 | On the roof | Phone/tablet form: start and finish times, confirmed system size, finished-roof photos, on-screen customer signature | R13–R15 |
| F11 | Rainy season breakdown | Find customer and exact inverter serial within seconds, with warranty status | R16 |
| F12 | Rainy season breakdown | Covered repair or replacement costs the customer nothing; otherwise parts and labour are billed automatically | R17, R18 |
| F13 | Rainy season breakdown | Complaint tracked as a ticket until the customer confirms everything works | R19 |
| F14 | Director's month-end | Profit or loss per installation, and what is unfinished | R20 |
| F15 | Director's month-end | Invoices to send, subsidy paperwork tracking, technician pay | R21–R23 |
| F16 | Director's month-end | Today / this week / this month view including per-job profit and open repairs, and sharing the numbers | R24, R25 |

The PDF prescribes a phone/tablet form, scanning before warehouse exit and an on-screen signature. It does not prescribe scanner integration, export or sharing format, or tax handling. Those choices belong to the team and are recorded in [decisions and assumptions](../foundations/decisions-and-assumptions.md).

### Process and submission

| # | Requirement | Tag | Source |
|---|---|---|---|
| P1 | Add the evaluator as a collaborator on the GitHub repository by **31 Oct, 11:00** | MUST | EV timeline. Evaluator: Sujal Prajapati, GitHub `supr-odoo` / `hackathon-odoo` |
| P2 | Submit the GitHub repository link on the portal ("Submit GitHub Repo Link" button) | MUST | EV portal |
| P3 | Stop coding at **01 Nov, 10:00** | MUST | EV timeline |
| P4 | Submit video links by **01 Nov, 10:30** | MUST | EV timeline |
| P5 | Present at **01 Nov, 13:00** (presentations and valedictory) | MUST | EV timeline |

## Event rules: verified or not stated

All times are as shown on the event page; the timezone is not printed and is assumed to be IST (the venue is in Telangana). "Verified" means verified within the captured screenshots only.

| Topic | Status | Detail |
|---|---|---|
| Event | verified | Odoo x GCET Hyderabad Hackathon 2026, event ID 69158, at Geethanjali College of Engineering and Technology, Cheeryal, Keesara, Rangareddy, Telangana |
| Format | verified | "a 24-hour coding marathon" |
| Problem statement announcement | verified | 31 Oct, 09:30 |
| Coding start | verified | 31 Oct, 10:00 (H0 in the execution plan) |
| Evaluator as repository collaborator | verified | Due 31 Oct, 11:00 (H1) |
| Coding end | verified | 01 Nov, 10:00 (H24) |
| Video link submission | verified (deadline only) | 01 Nov, 10:30 |
| Video length, content, format, hosting | not stated | Not on the captured page |
| Presentations and valedictory | verified (time only) | 01 Nov, 13:00 |
| Presentation length and format | not stated | |
| Repository link submission | verified | Portal button; no deadline shown separately |
| Repository visibility (public or private) | not stated | |
| Deployment or hosting | not stated | |
| Language | verified: no restriction | "All programming languages are welcome!" |
| Framework (including the Odoo framework) | not stated | The page doesn't name a required framework |
| Team size | verified | Up to 4 members; cross-institution teams allowed |
| Team 88 members | verified | Mohammed Muzaffar (leader), Nirmayi Parinitha, Bhanu Teja Gupta Vuppu, putin |
| Eligibility | verified | Tech students, freshers and coding enthusiasts aged 18+ |
| Judging criteria | not stated on EV | Only VID (2025) lists criteria |
| Code reuse from earlier projects | not stated | |
| Contact | verified | Helpdesk link on the event page |

## Conflicts with current plans

Checked against `docs/planning/submission-and-demo.md` and `docs/planning/execution-plan.md` at `bfbcf53`.

| # | Plan says | Event page says | Effect |
|---|---|---|---|
| C1 | `submission-and-demo.md` cites event **69159** | The team's event is **69158** | Wrong link; fix the reference |
| C2 | "Ignore unverified wall-clock deadlines" and a relative 24-hour budget (`submission-and-demo.md`; ADR-12) | Deadlines are now verified: H0 = 31 Oct 10:00, H24 = 01 Nov 10:00 | Calendar conversion only: H22.5 release = 01 Nov 08:30 IST. The team is already past H4.8 with business tasks still planned, so re-plan the remaining effort from now rather than restarting H0 |
| C3 | Evaluator access verified "H0 and H22" (`submission-and-demo.md` artifact table) | Evaluator must be a collaborator by **H1** (31 Oct 11:00) | At 14:48 IST the GitHub collaborators API listed `vbtgongithub`, `Muzaffar-codes07`, `Tuhin-void`, `3upho`, and the invitations API returned no pending invitations; neither `supr-odoo` nor `hackathon-odoo` appeared. **The deadline has passed; a repo admin must add the evaluator now** and confirm with the helpdesk which account is required |
| C4 | "Cloud URL/video link, if required … before actual submission" (`submission-and-demo.md`) | Video links are a required milestone, due 01 Nov 10:30 | Video is MUST; the page gives only the deadline. Team recommendation (not an organizer rule): record before H24, since only 30 minutes separate coding end from the video deadline |
| C5 | Recovery/submission buffer H22.5–24 (`execution-plan.md`) | Coding ends at H24, video due H24.5, presentation H27 | Team recommendation: the buffer also absorbs video recording and upload; rehearse H24–H27 without code changes, subject to venue and organizer instructions |
| C6 | "Three-minute demonstration" (`submission-and-demo.md` title, runbook) | Presentation length not stated | Three minutes is a team assumption, not an organizer rule; confirm it at the venue |
| C7 | Local DB, custom APIs and no BaaS treated as organizer-required (ADR-03, citing VID) | EV lists backend APIs, data model and local DB under **Nice to have** | No change to the build: the team keeps them as an owner decision. Don't describe them as an organizer "must" |
| C8 | Odoo framework requirement listed as unknown (ADR-17) | "All programming languages are welcome"; no framework named | Language is unrestricted. A framework requirement is still not stated; confirm at the helpdesk if it matters |
| C9 | Offline sync is excluded (P2, `execution-plan.md`) | Nice to have: "Plan for offline or local solutions" | Partly aligned. Local deployment satisfies "local"; say so in the presentation. Offline sync stays out of scope |
| C10 | `execution-plan.md` assumes four contributors D1–D4, each committing | EV MUST: proper Git use; one member managing the repository is not enough | At 14:48 IST, `git log` shows two author identities: `Tuhin-void` and `VBTG`. Contribution by all four members is unverified, because logins are not yet mapped to people. Confirm the mapping and collect each member's commits. (Every member having their own commits is the team's stricter standard, from VID and the plan, not the EV wording) |
| C11 | Team members are only role slots D1–D4 in `docs/team/roles.md` | Portal names four people | Names and GitHub logins are not yet mapped to roles |
| C12 | `docs/team/roles.md` and ADR-02: one frontend developer and three backend developers | Not an event rule; the owner has since asked for component-based ownership (each owner builds API and UI for their components) | The plan docs and roles still describe the layer split; reconcile them after the owner confirms the component assignments and person mapping |

## What this review does not cover

- Content on the event page below the "Must have / Nice to have" cards, which was not captured.
- Helpdesk tickets or announcements made at the venue.
- Any rule given verbally on site. Record those here with their source when they arrive.
