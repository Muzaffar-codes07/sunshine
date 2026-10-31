# Warehouse workspace

Owner: **D1**, built with D3. Status: **stock levels, receiving, reserving and scanning implemented**. Posting a dispatch and delivery wait for D4's cost writer. Transfers, counts and releasing a reservation have APIs but no screens yet.

A hardware scanner works as a keyboard: scan into the focused field and it submits on Enter. Camera scanning isn't built, because the device check with D1 hasn't happened. Typed entries are recorded but never count towards a required scan.

Use shared list/detail/form/status patterns and typed API contracts. Backend owners supply fixtures and attend integration slots. Do not duplicate business or financial rules in the browser.
