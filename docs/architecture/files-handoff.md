# Private files handoff (B08)

D2 owns transport, metadata and its authorization port. D3 owns job access, evidence associations and completion gates; D4 owns ticket access. The production provider now wires D3's real JOB adapter. TICKET access stays unavailable until D4's adapter is supplied.

## HTTP

- POST /api/v1/files: authenticated multipart, exactly one field named file, optionally both contextType (JOB or TICKET) and contextId (UUID). No actor, path, hash, status or size overrides. Returns {data: StoredFile}.
- GET /api/v1/files/:id: authenticated attachment download, private/no-store and nosniff. Random server filename; storage key is never returned. Unknown file 404, unauthorized access 403, missing/corrupt bytes 503.
- Exact-origin protection covers multipart before bytes reach the interceptor. File size cap is 10 MiB; declared MIME must match detected JPEG, PNG, WebP or PDF container bytes. JPEG end markers may precede trailing phone metadata; the complete original bytes are retained. Container checks are not full decoding, virus scanning or authenticity verification.
- Unbound uploads are private to their uploader, including against other admins. They are not completion evidence.

## Domain integration

`JobFileAccessModule` exports FILE_RECORD_AUTHORIZER and is imported by FilesModule without importing FieldModule. It implements assertAccess(tx, actor, {contextType, contextId}, action), where action is UPLOAD, DOWNLOAD or ATTACH. JOB checks the real job/order backlink, accepted quote and matching enquiry/customer, then applies the [D3 policy](../../apps/api/src/field/README.md). ADMIN and active assigned technicians may upload/attach unless the job is COMPLETED; ADMIN, SALES and active assigned technicians may download. Removed assignments revoke uploader access. Missing records return safe404, inconsistent job source relationships return sanitized503 JOB_RECORD_INVALID, denied actors403, and completed-job writes409 JOB_ALREADY_COMPLETED. The adapter reads and locks through the caller transaction only, with no independent commit or file/network I/O. TICKET always fails503 FILE_AUTHORIZATION_UNAVAILABLE until D4 integration.

Bound access always calls the adapter, including when the requester uploaded the file. Missing adapter returns 503 FILE_AUTHORIZATION_UNAVAILABLE. No blanket admin bypass is invented here.

FilesService.attach(tx, fileId, context, actor) checks the source, authorizes/claims the job before locking the file row, rechecks orphan ownership/association under that lock and binds it inside the caller's transaction. This Job-before-File ordering matches later field commands and avoids a cycle. Another record cannot claim the same file, including during concurrent attempts. A rollback leaves the upload unbound. This generic JOB/TICKET association adds no placeholder foreign keys; the real JOB adapter supplies referential/access checks and TICKET remains closed.

Before a critical completion/stock/money transaction, call download(fileId, actor) to verify current private bytes (size and SHA-256). Inside the transaction, call requireEvidence(tx, fileId, context, actor) to require persisted metadata, exact association and current record access. It performs no file I/O. An unbound or wrong-record upload yields EVIDENCE_REQUIRED. The adapter must still validate the complete job/ticket/customer relationship; a matching UUID alone is insufficient.

## Persistence and operation

UPLOAD_DIR defaults to repository-relative var/uploads, independent of npm workspace cwd. Use a dedicated private directory outside apps/web; lexical paths and symlink-resolved roots are checked. No static upload mount exists.

A server-generated UUID is written exclusively, flushed and closed before the short metadata transaction begins. Only successful complete writes create rows; there is no pending-row evidence. A rejected metadata transaction removes the owned blob. An interrupted process or a cleanup failure can leave an unreferenced blob, which does not count as evidence. A cleanup failure logs only a generic message.

Retain unreferenced blobs for at least 24 hours before an operator cleanup. With API writes stopped and a matching backup taken, compare server keys with files.storageKey and remove only unreferenced keys older than that window. Never delete File metadata or a blob whose key is still referenced, including unbound uploads. No automatic destructive cleaner is included. Back up PostgreSQL and matching private files together; this PR does not claim a second-host restore rehearsal.

Files are immutable through both the public API and the database evidence guard. The guard freezes every persisted metadata field, allows one initial paired JOB/TICKET association, permits a same-context no-op and refuses rebind/unbind, DELETE and TRUNCATE (including unbound rows). A refusal maps to409 FILE_EVIDENCE_LOCKED. A correction needs a new upload. No public delete or rebind operation exists. Download verifies persisted size/hash and refuses missing or modified bytes without exposing a path. The local filesystem and its administrators are trusted; these checks do not make local storage tamper-proof.

## Schema and verification

Migration 20261031255000_files was generated with Prisma migrate dev --create-only on isolated PostgreSQL 17.11, then given explicit BEGIN/COMMIT and six CHECKs: storage-key format, nonblank safe filename, known MIME, 1..10 MiB size, SHA-256 format, and paired context fields. Uploader is a real restrictive User foreign key. Canonical CHECK definitions are registered. The JOB adapter needs no schema changes; TICKET still needs its adapter.

Real PostgreSQL/disk tests cover bytes/metadata, cross-user denial, missing/forged/oversize requests, disk/metadata failures, fail-closed adapters, exact associations, rollback and concurrent binding, missing/altered bytes, SQL backstops, multipart origin/login/limits, attachment headers and static non-disclosure. No GPS, certified signature or photo-authenticity claim is made.

The appended Files evidence guard migration retains applied255000 SQL unchanged. Its function and two triggers are registered with exact PostgreSQL17.11 definitions. Real database regressions cover Prisma/raw metadata mutations, first/same association, rollback, rebind/unbind and DELETE/TRUNCATE; byte-integrity and current job-access checks remain in place.
