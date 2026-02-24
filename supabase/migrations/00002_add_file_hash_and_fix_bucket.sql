-- Add file_hash column for SHA256 duplicate detection
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_hash text;

-- Unique partial index: one hash per org among non-deleted documents
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_org_file_hash
  ON documents (organization_id, file_hash)
  WHERE file_hash IS NOT NULL AND deleted_at IS NULL;

-- Increase storage bucket size limit from 10MB to 50MB
UPDATE storage.buckets
  SET file_size_limit = 52428800  -- 50 * 1024 * 1024
  WHERE id = 'documents';
