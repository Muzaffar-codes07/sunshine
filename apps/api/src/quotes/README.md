# Quotes

D2's frozen quote and manual send/accept/reject workflow. See
[quote handoff](../../../../docs/architecture/quote-handoff.md) for the HTTP
contracts, C5 transaction helper, policy source and database rules.

No order, invoice, payment, warehouse allocation or outbound message is created
by this module. Warranty terms come from `product_warranty_policies` through the
warranty module's reader and are frozen on each product line. A product with no
policy saves its line as explicitly UNCONFIGURED; no terms are inferred.
