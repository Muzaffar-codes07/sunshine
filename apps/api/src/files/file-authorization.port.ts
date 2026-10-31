import type { FileContext, StaffIdentity } from '@sunshine/contracts';
import type { Prisma } from '../generated/prisma/client';
export const FILE_RECORD_AUTHORIZER = Symbol('FILE_RECORD_AUTHORIZER');
/** D3/D4 adapter checks existence, actor access and record/customer relationships.
 * Throw a safe 403/404 on refusal. Database reads only, no independent commit or I/O.
 * Export the provider from a module imported by FilesModule before enabling bound files.
 */
export interface FileRecordAuthorizer {
  assertAccess(tx: Prisma.TransactionClient, actor: StaffIdentity, context: FileContext, action: 'UPLOAD' | 'DOWNLOAD' | 'ATTACH'): Promise<void>;
}
