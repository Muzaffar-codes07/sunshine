# Shared product components

D1 owns these frontend components. `patterns.tsx` provides list (loading/error/empty/table), detail, form, timeline, modal action drawer, and summary/reconciliation patterns. The staff login uses the form pattern. Open `/patterns` in development for explicitly labeled examples; this route is absent from release builds.

Pass server-provided totals and readiness decisions into these components. They do not implement business calculations, permissions, or stock rules. Domain screens and specialized money/quantity/upload controls remain planned. The F02 scan/photo/signature spike stays separate.
