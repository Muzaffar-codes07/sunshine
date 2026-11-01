import { Body, Controller, Get, Header, Module, Param, ParseUUIDPipe, Post, Req, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FILE_MAX_BYTES, uploadFileFieldsSchema, type FileContext } from '@sunshine/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { AuthModule } from '../auth/auth.module';
import type { AuthenticatedStaffRequest } from '../auth/auth.types';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { JobFileAccessModule } from '../field/job-file-access';
import { FilesService, type UploadedBytes } from './files.service';
import { PrivateFileStore } from './private-file.store';

@Controller('files')
@UseGuards(AuthGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FILE_MAX_BYTES, files: 1, fields: 2, fieldSize: 128, parts: 3 } }))
  upload(
    @UploadedFile() file: UploadedBytes | undefined,
    @Body(new ZodValidationPipe(uploadFileFieldsSchema)) fields: FileContext | Record<string, never>,
    @Req() request: AuthenticatedStaffRequest,
  ) { return this.files.upload(file, fields, request.user); }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Req() request: AuthenticatedStaffRequest) {
    const { file, buffer } = await this.files.download(id, request.user);
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[file.mediaType];
    return new StreamableFile(buffer, { type: file.mediaType, length: buffer.length, disposition: 'attachment; filename="' + file.id + '.' + extension + '"' });
  }
}
@Module({ imports: [AuthModule, JobFileAccessModule], controllers: [FilesController], providers: [FilesService, PrivateFileStore], exports: [FilesService, PrivateFileStore] })
export class FilesModule {}
