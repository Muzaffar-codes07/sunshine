# Warehouse workspace

Owner: **D1**, built with D3. Status: **current/historical stock, movements, integrity, valuation, serial lookup, receiving, reservation, camera/manual/scanner capture, dispatch and delivery implemented**. Transfers, counts and releasing a reservation have APIs but no screens yet.

A hardware scanner works as a keyboard: select USB/Bluetooth scanner as the input source, scan into the field and submit on Enter. Keyboard entry defaults to TYPED and never counts towards a required scan. Camera capture uses the shared ScanInput and records CAMERA evidence. Browser lifecycle tests use simulated media APIs; compatibility with the actual demo phone/scanner remains unverified. Receiving reuses ReceiveStock and the shared retry-safe command rather than the superseded receipt drawer.

Use shared list/detail/form/status patterns and typed API contracts. Backend owners supply fixtures and attend integration slots. Do not duplicate business or financial rules in the browser.
