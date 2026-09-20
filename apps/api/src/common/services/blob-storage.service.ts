import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

// EP-013: server-mediated document storage - the API is the sole gatekeeper
// (upload/download both stream through it), no client-side direct-to-blob SAS
// access, so the self-or-admin authorization check in documents.service.ts is
// the one place access is enforced, and no CORS config is needed on the
// storage account.
//
// Deliberate deviation from EmailService's pattern: EmailService.send() never
// throws (a missed email is recoverable and must never break the operation
// it's attached to). upload()/download() here DO throw if unconfigured - a
// document upload that silently discarded the file while the API returned
// success would be a serious, silent compliance failure, unlike a missed
// notification email. delete() stays a no-op-if-unconfigured, since a delete
// against an unconfigured store is harmless, not a data-loss risk.
@Injectable()
export class BlobStorageService {
  private readonly containerClient: ContainerClient | null;

  constructor(private readonly config: ConfigService) {
    const connectionString = this.config.get<string>('storage.connectionString');
    const containerName = this.config.get<string>('storage.containerName')!;
    this.containerClient = connectionString
      ? BlobServiceClient.fromConnectionString(connectionString).getContainerClient(
          containerName,
        )
      : null;
  }

  get isConfigured(): boolean {
    return this.containerClient !== null;
  }

  async upload(blobPath: string, buffer: Buffer, mimeType: string): Promise<void> {
    if (!this.containerClient) {
      throw new InternalServerErrorException(
        'Document storage is not configured',
      );
    }
    await this.containerClient
      .getBlockBlobClient(blobPath)
      .uploadData(buffer, { blobHTTPHeaders: { blobContentType: mimeType } });
  }

  async download(blobPath: string): Promise<NodeJS.ReadableStream> {
    if (!this.containerClient) {
      throw new InternalServerErrorException(
        'Document storage is not configured',
      );
    }
    const response = await this.containerClient
      .getBlockBlobClient(blobPath)
      .download();
    if (!response.readableStreamBody) {
      throw new InternalServerErrorException('Could not read this document');
    }
    return response.readableStreamBody as NodeJS.ReadableStream;
  }

  async delete(blobPath: string): Promise<void> {
    if (!this.containerClient) return;
    await this.containerClient.getBlockBlobClient(blobPath).deleteIfExists();
  }
}
