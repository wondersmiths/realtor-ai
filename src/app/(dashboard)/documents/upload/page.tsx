'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { FileUpload } from '@/components/shared/file-upload';
import { useToast } from '@/providers/toast-provider';

interface ListingOption {
  value: string;
  label: string;
}

export default function UploadDocumentPage() {
  const router = useRouter();
  const { addToast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState('');
  const [selectedListingId, setSelectedListingId] = useState('');
  const [listings, setListings] = useState<ListingOption[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch listings for the dropdown
  useEffect(() => {
    async function fetchListings() {
      try {
        const res = await fetch('/api/listings?pageSize=100');
        if (!res.ok) return;
        const json = await res.json();
        const data = json.data ?? [];
        setListings(
          data.map((l: { id: string; address: string; mls_number: string | null }) => ({
            value: l.id,
            label: l.mls_number ? `${l.address} (MLS# ${l.mls_number})` : l.address,
          }))
        );
      } catch {
        // Listings dropdown is optional; silently ignore errors
      }
    }
    fetchListings();
  }, []);

  const handleFileSelect = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    // Auto-fill document name from filename (remove extension)
    const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
    setDocumentName(nameWithoutExt);
    setUploadProgress('idle');
    setErrorMessage(null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setErrorMessage('Please select a file to upload.');
      return;
    }

    setIsUploading(true);
    setUploadProgress('uploading');
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', documentName || file.name);
      if (selectedListingId) {
        formData.append('listing_id', selectedListingId);
      }

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message ?? 'Upload failed');
      }

      const json = await res.json();
      const newDocId = json.data?.id;

      setUploadProgress('success');
      addToast({
        type: 'success',
        title: 'Document uploaded',
        message: 'Your document has been uploaded successfully.',
      });

      // Redirect to the new document's detail page
      if (newDocId) {
        router.push(`/documents/${newDocId}`);
      } else {
        router.push('/documents');
      }
    } catch (err) {
      setUploadProgress('error');
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setErrorMessage(msg);
      addToast({
        type: 'error',
        title: 'Upload failed',
        message: msg,
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back Link */}
      <button
        onClick={() => router.push('/documents')}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Documents
      </button>

      <Card>
        <CardHeader>
          <CardTitle>Upload Document</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* File Upload */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                File <span className="text-red-500">*</span>
              </label>
              <FileUpload
                onFileSelect={handleFileSelect}
                accept={['.pdf', '.doc', '.docx', '.txt', '.rtf', 'application/pdf']}
                maxSize={25 * 1024 * 1024} // 25MB
                disabled={isUploading}
              />
            </div>

            {/* Document Name */}
            <Input
              label="Document Name"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              placeholder="Enter document name"
              disabled={isUploading}
            />

            {/* Listing Selector */}
            {listings.length > 0 && (
              <Select
                label="Associated Listing"
                options={[{ value: '', label: 'None (standalone document)' }, ...listings]}
                value={selectedListingId}
                onChange={(e) => setSelectedListingId(e.target.value)}
                disabled={isUploading}
              />
            )}

            {/* Error message */}
            {errorMessage && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
              </div>
            )}

            {/* Success message */}
            {uploadProgress === 'success' && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
                <p className="text-sm text-green-700 dark:text-green-300">
                  Document uploaded successfully! Redirecting...
                </p>
              </div>
            )}

            {/* Submit */}
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/documents')}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={isUploading}
                disabled={!file || isUploading}
              >
                <Upload className="h-4 w-4" />
                Upload Document
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
