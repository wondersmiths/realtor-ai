'use client';

import { useState, useRef, useCallback, type DragEvent } from 'react';
import { UploadCloud, File as FileIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string[];
  maxSize?: number; // bytes
  className?: string;
  disabled?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function FileUpload({
  onFileSelect,
  accept,
  maxSize,
  className,
  disabled = false,
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = useCallback(
    (file: File): string | null => {
      if (accept && accept.length > 0) {
        const isAllowedType = accept.some(
          (type) =>
            file.type === type ||
            (type.startsWith('.') && file.name.toLowerCase().endsWith(type))
        );
        if (!isAllowedType) {
          return `File type not allowed. Accepted: ${accept.join(', ')}`;
        }
      }
      if (maxSize && file.size > maxSize) {
        return `File size exceeds the ${formatFileSize(maxSize)} limit.`;
      }
      return null;
    },
    [accept, maxSize]
  );

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      const validationError = validate(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setSelectedFile(file);
      onFileSelect(file);
    },
    [validate, onFileSelect]
  );

  const handleDrag = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;

      if (e.type === 'dragenter' || e.type === 'dragover') {
        setDragActive(true);
      } else if (e.type === 'dragleave') {
        setDragActive(false);
      }
    },
    [disabled]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (disabled) return;

      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [disabled, handleFile]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  const handleRemove = () => {
    setSelectedFile(null);
    setError(null);
  };

  return (
    <div className={cn('w-full', className)}>
      {!selectedFile ? (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !disabled && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (!disabled) inputRef.current?.click();
            }
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors',
            'cursor-pointer',
            dragActive
              ? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/10'
              : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          <UploadCloud
            className={cn(
              'h-8 w-8',
              dragActive ? 'text-blue-500' : 'text-gray-400'
            )}
          />
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Drag and drop a file here, or click to browse
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {accept && accept.length > 0 && (
                <span>
                  Accepted:{' '}
                  {accept
                    .map((t) =>
                      t.startsWith('.') ? t : t.split('/')[1]?.toUpperCase()
                    )
                    .join(', ')}
                </span>
              )}
              {maxSize && (
                <span>
                  {accept && accept.length > 0 ? ' | ' : ''}
                  Max size: {formatFileSize(maxSize)}
                </span>
              )}
            </p>
          </div>

          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={accept?.join(',')}
            onChange={handleInputChange}
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
          <FileIcon className="h-8 w-8 shrink-0 text-blue-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-50">
              {selectedFile.name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatFileSize(selectedFile.size)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              handleRemove();
            }}
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
