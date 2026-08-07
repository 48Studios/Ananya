"use client";

import * as React from "react";
import {
  Upload,
  Loader2,
  X,
  CheckCircle2,
  FileText,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { documentsApi } from "@/lib/api/documents-api";

export interface FileUploaderProps {
  /** Optional file extension or MIME type filter (e.g. ".csv,.xlsx,.json" or "image/*,.pdf") */
  accept?: string;
  /** Maximum file size in bytes. Default: 50MB (52,428,800 bytes) */
  maxSizeBytes?: number;
  /** Allow selecting multiple files */
  multiple?: boolean;
  /** Disable interactions */
  disabled?: boolean;
  /** External loading state indicator */
  loading?: boolean;
  /** Callback fired when a single file is selected */
  onFileSelected?: (file: File) => void | Promise<void>;
  /** Callback fired when multiple files are selected */
  onFilesSelected?: (files: File[]) => void | Promise<void>;
  /** Direct Document API upload target: Entity Type */
  entityType?: string;
  /** Direct Document API upload target: Entity ID */
  entityId?: string;
  /** Callback fired after direct Document API upload completes successfully */
  onUploadSuccess?: () => void;
  /** Custom heading text */
  title?: string;
  /** Custom subtitle/description text */
  description?: string;
  /** Extra CSS classes */
  className?: string;
}

export function FileUploader({
  accept = ".csv,.xlsx,.json,image/*,.pdf,.doc,.docx,.step,.stl",
  maxSizeBytes = 50 * 1024 * 1024,
  multiple = false,
  disabled = false,
  loading: externalLoading = false,
  onFileSelected,
  onFilesSelected,
  entityType,
  entityId,
  onUploadSuccess,
  title = "Drag & Drop file or click to browse",
  description = "Supports CSV, Excel, JSON, PDF, Images & CAD up to 50MB (Paste images directly)",
  className = "",
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [internalLoading, setInternalLoading] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const isLoading = externalLoading || internalLoading;

  const validateFile = (file: File): boolean => {
    if (file.size > maxSizeBytes) {
      const maxMb = (maxSizeBytes / (1024 * 1024)).toFixed(0);
      setErrorMsg(
        `File "${file.name}" exceeds maximum allowed size of ${maxMb}MB`,
      );
      return false;
    }

    if (accept && accept !== "*") {
      const acceptedTypes = accept
        .split(",")
        .map((a) => a.trim().toLowerCase());
      const fileNameLower = file.name.toLowerCase();
      const fileTypeLower = file.type.toLowerCase();

      const isMatch = acceptedTypes.some((pattern) => {
        if (pattern.startsWith(".")) {
          return fileNameLower.endsWith(pattern);
        }
        if (pattern.endsWith("/*")) {
          const mainType = pattern.slice(0, -2);
          return fileTypeLower.startsWith(mainType);
        }
        return fileTypeLower === pattern;
      });

      if (!isMatch) {
        setErrorMsg(
          `File "${file.name}" format is not supported. Supported formats: ${accept}`,
        );
        return false;
      }
    }

    return true;
  };

  const processSelectedFiles = async (files: File[]) => {
    if (files.length === 0 || disabled || isLoading) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    const validFiles = files.filter(validateFile);
    if (validFiles.length === 0) return;

    const primaryFile = validFiles[0]!;
    setSelectedFile(primaryFile);

    // 1. Call onFilesSelected or onFileSelected if provided
    if (multiple && onFilesSelected) {
      try {
        await onFilesSelected(validFiles);
      } catch (err: unknown) {
        setErrorMsg(
          err instanceof Error ? err.message : "Failed to process files",
        );
      }
    } else if (onFileSelected) {
      try {
        await onFileSelected(primaryFile);
      } catch (err: unknown) {
        setErrorMsg(
          err instanceof Error ? err.message : "Failed to process file",
        );
      }
    }

    // 2. Direct Document API upload if entityType and entityId are specified
    if (entityType && entityId) {
      setInternalLoading(true);
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const result = evt.target?.result as string;
          const base64Data = result.split(",")[1] || result;

          await documentsApi.uploadDocument({
            entityType,
            entityId,
            title: primaryFile.name,
            fileName: primaryFile.name,
            fileContent: base64Data,
            mimeType: primaryFile.type || "application/octet-stream",
            sizeBytes: primaryFile.size,
          });

          setSuccessMsg(`Successfully uploaded ${primaryFile.name}`);
          if (onUploadSuccess) onUploadSuccess();
          setTimeout(() => setSuccessMsg(null), 4000);
        } catch (err: unknown) {
          setErrorMsg(
            err instanceof Error ? err.message : "Document upload failed",
          );
        } finally {
          setInternalLoading(false);
        }
      };
      reader.onerror = () => {
        setErrorMsg("Failed to read file contents");
        setInternalLoading(false);
      };
      reader.readAsDataURL(primaryFile);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled || isLoading) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processSelectedFiles(files);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (disabled || isLoading) return;
    const items = Array.from(e.clipboardData.items);
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      processSelectedFiles(files);
    }
  };

  const handleButtonClick = () => {
    if (disabled || isLoading) return;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleButtonClick();
    }
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
    setErrorMsg(null);
    setSuccessMsg(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled && !isLoading) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
      }}
      onDrop={handleDrop}
      onPaste={handlePaste}
      onClick={handleButtonClick}
      className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        isDragging
          ? "border-primary bg-primary/10 scale-[1.01]"
          : disabled
            ? "border-border/40 bg-muted/20 opacity-60 cursor-not-allowed"
            : "border-border bg-card hover:border-primary/50 hover:bg-accent/40"
      } ${className}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled || isLoading}
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          if (files.length > 0) {
            processSelectedFiles(files);
          }
        }}
      />

      <div className="flex flex-col items-center justify-center gap-2 pointer-events-none">
        {isLoading ? (
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        ) : (
          <Upload className="w-8 h-8 text-muted-foreground/60" />
        )}

        <div>
          <p className="text-xs font-semibold text-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {description}
          </p>
        </div>

        {selectedFile && !isLoading && !errorMsg && (
          <div className="mt-1 flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border border-border text-xs text-foreground font-mono">
            <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="truncate max-w-[200px]">{selectedFile.name}</span>
            <span className="text-[10px] text-muted-foreground">
              ({(selectedFile.size / 1024).toFixed(1)} KB)
            </span>
          </div>
        )}

        <div className="pointer-events-auto mt-1 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || isLoading}
            onClick={(e) => {
              e.stopPropagation();
              handleButtonClick();
            }}
            className="text-xs"
          >
            Browse File
          </Button>

          {selectedFile && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="text-xs text-muted-foreground hover:text-foreground h-8 px-2"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Cancel
            </Button>
          )}
        </div>

        {errorMsg && (
          <div className="pointer-events-auto mt-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-1.5 rounded-lg flex items-center justify-between gap-2 max-w-full">
            <div className="flex items-center gap-1.5 truncate">
              <X className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{errorMsg}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setErrorMsg(null);
                handleButtonClick();
              }}
              className="h-6 px-1.5 text-[11px] text-destructive hover:bg-destructive/20"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Retry
            </Button>
          </div>
        )}

        {successMsg && (
          <div className="pointer-events-auto mt-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
}
