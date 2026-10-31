# Quotes

D2's frozen quote and manual send/accept/reject workflow. See
[quote handoff](../../../../docs/architecture/quote-handoff.md) for the HTTP
contracts, C5 transaction helper, policy source and database rules.

No order, invoice, payment, warehouse allocation or outbound message is created
by this module. The configured warranty policy source is still a D4 integration
dependency; current saved product lines explicitly report UNCONFIGURED terms.
