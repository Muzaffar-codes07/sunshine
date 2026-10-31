# Private files handoff (B08)

D2 owns transport, metadata and authorization. D3 owns evidence associations and completion gates; D4 owns ticket access. This branch supplies the core and an authorization port. Bound job/ticket routes stay unavailable until a real adapter is wired.

## HTTP

- POST /api/v1/files: authenticated multipart, exactly one field named file, optionally both contextType (JOB or TICKET) and contextId (UUID). No actor, path, hash, status or size overrides. Returns {data: StoredFile}.
- GET /api/v1/files/:id: authenticated attachment download, private/no-store and nosniff. Random server filename; storage key is never returned. Unknown file 404, unauthorized access 403, missing/corrupt bytes 503.
- Exact-origin protection covers multipart before bytes reach the interceptor. File size cap is 10 MiB; declared MIME must match detected JPEG, PNG, WebP or PDF container bytes. Container checks are not full decoding, virus scanning or authenticity verification.
- Unbound uploads are private to their uploader, including against other admins. They are not completion evidence.

## Domain integration

Export FILE_RECORD_AUTHORIZER from a module imported by FilesModule. It implements assertAccess(tx, actor, {contextType, contextId}, action), where action is UPLOAD, DOWNLOAD or ATTACH. It must check record existence, assignment/role access and the job/ticket/customer relationships; throw a safe 403/404 on refusal. Database access only, no independent commit or file/network I/O.

Bound access always calls the adapter, including when the requester uploaded the file. Missing adapter returns 503 FILE_AUTHORIZATION_UNAVAILABLE. No blanket admin bypass is invented here.

FilesService.attach(tx, fileId, context, actor) locks the file row, checks ownership for an orphan, authorizes the target and binds it inside the caller's transaction. Another record cannot claim the same file. A rollback leaves the upload unbound. This generic JOB/TICKET association deliberately adds no fictional Job/Ticket models or foreign keys; the domain adapter supplies referential and access checks until those schemas exist.

Before a critical completion/stock/money transaction, call download(fileId, actor) to verify current private bytes (size and SHA-256). Inside the transaction, call requireEvidence(tx, fileId, context, actor) to require persisted metadata, exact association and current record access. It performs no file I/O. An unbound or wrong-record upload yields EVIDENCE_REQUIRED. The adapter must still validate the complete job/ticket/customer relationship; a matching UUID alone is insufficient.

## Persistence and operation

UPLOAD_DIR defaults to repository-relative var/uploads, independent of npm workspace cwd. Use a dedicated private directory outside apps/web; lexical paths and symlink-resolved roots are checked. No static upload mount exists.

A server-generated UUID is written exclusively, flushed and closed before the short metadata transaction begins. Only successful complete writes create rows; there is no pending-row evidence. A rejected metadata transaction removes the owned blob. An interrupted process or a cleanup failure can leave an unreferenced blob, which does not count as evidence. A cleanup failure logs only a generic message.

Retain unbound and unreferenced uploads for at least 24 hours before an operator cleanup. With API writes stopped and a matching backup taken, compare server keys with files.storageKey and remove only unreferenced keys older than that window. No automatic destructive cleaner is included. Back up PostgreSQL and matching private files together; this PR does not claim a second-host restore rehearsal.

Files are immutable through the public API; no public delete or rebind operation exists. Download verifies persisted size/hash and refuses missing or modified bytes without exposing a path. The local filesystem and its administrators are trusted; these checks do not make local storage tamper-proof.

## Schema and verification

Migration 20261031190000_files was generated with Prisma migrate dev --create-only on isolated PostgreSQL 17.11, then given explicit BEGIN/COMMIT and six CHECKs: storage-key format, nonblank safe filename, known MIME, 1..10 MiB size, SHA-256 format, and paired context fields. Uploader is a real restrictive User foreign key. Canonical CHECK definitions are registered; bound-record adapters are still required.

Real PostgreSQL/disk tests cover bytes/metadata, cross-user denial, missing/forged/oversize requests, disk/metadata failures, fail-closed adapters, exact associations, rollback and concurrent binding, missing/altered bytes, SQL backstops, multipart origin/login/limits, attachment headers and static non-disclosure. No GPS, certified signature or photo-authenticity claim is made.
