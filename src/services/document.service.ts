import 'server-only';

import { SupabaseClient } from '@supabase/supabase-js';
import type { Document } from '@/types/database';
import { DocumentStatus } from '@/types/enums';
import type { DocumentWithUploader } from '@/types/domain';
import type { PaginationParams, PaginatedResponse } from '@/types/api';
import { NotFoundError, AppError, ValidationError } from '@/lib/errors';

const STORAGE_BUCKET = 'documents';

export class DocumentService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * List documents for an organization with pagination and optional status filter.
   */
  async list(
    orgId: string,
    params: PaginationParams & { status?: DocumentStatus; listingId?: string } = {}
  ): Promise<PaginatedResponse<DocumentWithUploader>> {
    const {
      page = 1,
      pageSize = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
      search,
      status,
      listingId,
    } = params;

    const offset = (page - 1) * pageSize;

    // Count total
    let countQuery = this.supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null);

    if (status) {
      countQuery = countQuery.eq('status', status);
    }
    if (listingId) {
      countQuery = countQuery.eq('listing_id', listingId);
    }
    if (search) {
      countQuery = countQuery.ilike('name', `%${search}%`);
    }

    const { count } = await countQuery;
    const total = count ?? 0;

    // Fetch documents with uploader profile
    let query = this.supabase
      .from('documents')
      .select(`
        *,
        uploader:profiles!documents_uploaded_by_fkey (
          id,
          email,
          full_name,
          avatar_url
        )
      `)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + pageSize - 1);

    if (status) {
      query = query.eq('status', status);
    }
    if (listingId) {
      query = query.eq('listing_id', listingId);
    }
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      throw new AppError(`Failed to list documents: ${error.message}`);
    }

    return {
      data: (data || []) as unknown as DocumentWithUploader[],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Get a single document by ID.
   */
  async getById(orgId: string, documentId: string): Promise<DocumentWithUploader> {
    const { data, error } = await this.supabase
      .from('documents')
      .select(`
        *,
        uploader:profiles!documents_uploaded_by_fkey (
          id,
          email,
          full_name,
          avatar_url
        )
      `)
      .eq('id', documentId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw new NotFoundError('Document not found');
    }

    return data as unknown as DocumentWithUploader;
  }

  /**
   * Upload a file to Supabase Storage and create a corresponding database record.
   * File path pattern: {orgId}/{documentId}/{filename}
   */
  async upload(
    orgId: string,
    uploadedBy: string,
    file: File,
    options: { listingId?: string; metadata?: Record<string, unknown> } = {}
  ): Promise<Document> {
    // Generate a temporary ID for the file path
    const tempId = crypto.randomUUID();
    const filePath = `${orgId}/${tempId}/${file.name}`;

    // Upload to Supabase Storage
    const { error: storageError } = await this.supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (storageError) {
      throw new AppError(`Failed to upload file: ${storageError.message}`);
    }

    // Create the database record
    const { data, error: dbError } = await this.supabase
      .from('documents')
      .insert({
        id: tempId,
        organization_id: orgId,
        listing_id: options.listingId || null,
        uploaded_by: uploadedBy,
        name: file.name,
        file_path: filePath,
        file_type: file.type,
        file_size: file.size,
        status: DocumentStatus.Pending,
        metadata: options.metadata || {},
      })
      .select('*')
      .single();

    if (dbError || !data) {
      // Attempt cleanup of the uploaded file
      await this.supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
      throw new AppError(`Failed to create document record: ${dbError?.message}`);
    }

    return data as Document;
  }

  /**
   * Transition a document's status to 'reviewing'.
   */
  async requestReview(orgId: string, documentId: string): Promise<Document> {
    // Verify the document exists and is in a reviewable state
    const existing = await this.getById(orgId, documentId);

    if (
      existing.status !== DocumentStatus.Pending &&
      existing.status !== DocumentStatus.Flagged
    ) {
      throw new ValidationError(
        `Cannot request review for a document with status "${existing.status}"`,
        { status: [`Document must be in pending or flagged status`] }
      );
    }

    const { data, error } = await this.supabase
      .from('documents')
      .update({
        status: DocumentStatus.Reviewing,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error || !data) {
      throw new AppError(`Failed to update document status: ${error?.message}`);
    }

    return data as Document;
  }

  /**
   * Soft-delete a document. Also removes the file from storage.
   */
  async softDelete(orgId: string, documentId: string): Promise<void> {
    const existing = await this.getById(orgId, documentId);

    // Soft delete the DB record
    const { error } = await this.supabase
      .from('documents')
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)
      .eq('organization_id', orgId)
      .is('deleted_at', null);

    if (error) {
      throw new AppError(`Failed to delete document: ${error.message}`);
    }

    // Remove the file from storage (best effort)
    if (existing.file_path) {
      await this.supabase.storage.from(STORAGE_BUCKET).remove([existing.file_path]);
    }
  }

  /**
   * Get a signed download URL for a document's file.
   */
  async getDownloadUrl(orgId: string, documentId: string, expiresIn = 3600): Promise<string> {
    const doc = await this.getById(orgId, documentId);

    const { data, error } = await this.supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(doc.file_path, expiresIn);

    if (error || !data?.signedUrl) {
      throw new AppError(`Failed to generate download URL: ${error?.message}`);
    }

    return data.signedUrl;
  }
}
