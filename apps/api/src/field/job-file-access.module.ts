import { Module } from '@nestjs/common';
import { FILE_RECORD_AUTHORIZER } from '../files/file-authorization.port';
import { JobFileAccessService } from './job-file-access.service';

/** Independent of FieldModule so later completion can import FilesModule without a cycle. */
@Module({
  providers: [JobFileAccessService, { provide: FILE_RECORD_AUTHORIZER, useExisting: JobFileAccessService }],
  exports: [FILE_RECORD_AUTHORIZER],
})
export class JobFileAccessModule {}
