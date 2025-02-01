import React, { useState } from "react";
import { FileText, X, Upload } from "lucide-react";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    const pdfFile = files.find((file) => file.type === "application/pdf");
    if (pdfFile) {
      setSelectedFile(pdfFile);
      onFileSelect(pdfFile);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      onFileSelect(e.target.files[0]);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
  };

  return (
    <div className="border-t border-gray-800 p-4">
      {!selectedFile ? (
        <div
          className={`relative border-2 border-dashed rounded-lg p-4 text-center
            ${
              dragActive
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-gray-700"
            }
            hover:border-emerald-500 transition-colors`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="flex flex-col items-center space-y-2">
            <Upload className="w-6 h-6 text-emerald-500" />
            <p className="text-sm text-gray-400">
              Drag and drop your PDF here or click to browse
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
          <div className="flex items-center space-x-3">
            <FileText className="w-5 h-5 text-emerald-500" />
            <span className="text-sm truncate">{selectedFile.name}</span>
          </div>
          <button
            onClick={handleRemoveFile}
            className="p-1 hover:bg-gray-700 rounded-full transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
