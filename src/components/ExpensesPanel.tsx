import React, { useState, useEffect, useRef, useMemo } from "react";
import { X, Save, Trash2, Calendar, Link as LinkIcon, Upload, Loader2, Coins, Receipt, Type, Tag } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import axios from "axios";
import { FOLDER_LOCATIONS } from "../FolderLocation";

interface ExpensesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  onDelete: (row: any) => Promise<void>;
  initialData?: any;
  headers: string[];
  onDirtyChange?: (isDirty: boolean) => void;
}

export default function ExpensesPanel({ 
  isOpen, 
  onClose, 
  onSave, 
  onDelete, 
  initialData, 
  headers, 
  onDirtyChange 
}: ExpensesPanelProps) {
  const [formData, setFormData] = useState<any>({});
  const [isEditing, setIsEditing] = useState(!initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInputTitle, setDeleteInputTitle] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const idKey = useMemo(() => {
    return headers.find(h => {
      const cleaned = h.toLowerCase().trim();
      return cleaned === "expenses title" || cleaned === "title" || cleaned === "expense title";
    }) || "Expenses Title";
  }, [headers]);

  const handleDeleteClick = async () => {
    const actualTitle = String(initialData?.[idKey] || "");
    if (deleteInputTitle !== actualTitle) return;

    try {
      setIsSubmitting(true);
      await onDelete(initialData!);
      setShowDeleteConfirm(false);
      setDeleteInputTitle("");
      onClose();
    } catch (error) {
      console.error("Delete failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDateForFileName = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric'
      }).format(date);
    } catch (e) {
      return dateStr;
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formDataUpload = new FormData();
    
    // Format filename: Expense - Date (Mmm DD, YYYY) - File Name
    const formattedDate = formatDateForFileName(formData["Date"]);
    const title = formData["Expenses Title"] || "Expense";
    const newFileName = formattedDate ? `${title} - ${formattedDate} - ${file.name}` : `${title} - ${file.name}`;
    
    formDataUpload.append("file", file);
    formDataUpload.append("folderPath", FOLDER_LOCATIONS.EXPENSES_VOUCHER);
    formDataUpload.append("departmentName", newFileName.replace(/\.[^/.]+$/, "")); 

    try {
      const response = await axios.post("/api/upload", formDataUpload, { timeout: 60000 });
      const uploadedUrl = response.data?.url || response.data?.fileLink;
      if (uploadedUrl) {
        let viewUrl = uploadedUrl;
        // Transform Google Drive download link to view link
        if (viewUrl.includes("drive.google.com/uc") || viewUrl.includes("export=download")) {
          const fileIdMatch = viewUrl.match(/[?&]id=([^&]+)/);
          if (fileIdMatch && fileIdMatch[1]) {
            viewUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/view`;
          }
        }
        handleChange("Voucher", viewUrl);
      }
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (isOpen) {
      setFormData(initialData || {});
      setIsEditing(!initialData);
      setShowDeleteConfirm(false);
      setDeleteInputTitle("");
    }
  }, [isOpen, initialData]);

  const handleChange = (key: string, value: string) => {
    const newData = { ...formData, [key]: value };
    setFormData(newData);
    if (onDirtyChange) {
      const isDirty = Object.keys(newData).some(k => newData[k] !== (initialData?.[k] || ""));
      onDirtyChange(isDirty);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error("Save failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="absolute top-0 right-0 bottom-0 w-80 bg-white shadow-2xl flex flex-col z-40 border-l border-gray-200"
        >
          <div className="flex items-center justify-between p-3 bg-teal-600 text-white">
            <h3 className="text-xs font-bold uppercase tracking-widest">
              {initialData ? (isEditing ? "Edit Expense" : "View Expense") : "Add Expense"}
            </h3>
            <div className="flex items-center gap-2">
              {initialData && !isEditing && (
                <>
                  <button onClick={() => setIsEditing(true)} className="p-1 hover:bg-teal-700 rounded transition-colors">
                    <Type className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setShowDeleteConfirm(true)} 
                    className="p-1 hover:bg-red-500 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
              <button onClick={onClose} className="p-1 hover:bg-teal-700 rounded transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
            {showDeleteConfirm ? (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 border border-red-100 rounded-lg p-4 space-y-4"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <Trash2 className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-red-900">Confirm Deletion</h4>
                    <p className="text-[11px] text-red-700 mt-1 leading-relaxed">
                      This will permanently remove this expense from the records.
                    </p>
                    <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                      Please type the Expenses Title to confirm: <br/>
                      <span className="font-mono font-bold text-red-600 bg-white px-2 py-0.5 rounded border border-red-100 inline-block mt-1">
                        {String(initialData?.[idKey] || "")}
                      </span>
                    </p>
                  </div>
                </div>

                <input
                  type="text"
                  value={deleteInputTitle}
                  onChange={(e) => setDeleteInputTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border-2 border-red-100 rounded-lg focus:border-red-500 outline-none transition-all placeholder:text-red-200"
                  placeholder="Enter Expense Title..."
                  autoFocus
                />

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteInputTitle("");
                    }}
                    className="flex-1 px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-lg transition-colors shadow-sm"
                  >
                    CANCEL
                  </button>
                  <button
                    type="button"
                    disabled={deleteInputTitle !== String(initialData?.[idKey] || "") || isSubmitting}
                    onClick={handleDeleteClick}
                    className="flex-1 px-4 py-2 text-xs font-bold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
                  >
                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    DELETE
                  </button>
                </div>
              </motion.div>
            ) : (
              <div className="space-y-4">
              {headers.map((header) => {
                const isVoucher = header.toLowerCase().includes("voucher");
                const isDate = header.toLowerCase().includes("date");
                const isAmount = header.toLowerCase().includes("amount");
                const isTitle = header.toLowerCase().includes("title");
                const isTag = header.toLowerCase().includes("tag");

                let Icon = Receipt;
                if (isDate) Icon = Calendar;
                if (isVoucher) Icon = LinkIcon;
                if (isAmount) Icon = Coins;
                if (isTag) Icon = Tag;

                return (
                  <div key={header} className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 flex items-center gap-1">
                      <Icon className="w-3 h-3" />
                      {header}
                    </label>
                    {isEditing ? (
                      <div className="flex gap-2">
                        <input
                          type={isDate ? "date" : isAmount ? "number" : "text"}
                          step={isAmount ? "0.01" : undefined}
                          value={formData[header] || ""}
                          onChange={(e) => handleChange(header, e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:border-teal-500 outline-none transition-all"
                          placeholder={`Enter ${header}...`}
                        />
                        {isVoucher && (
                          <>
                            <input
                              type="file"
                              ref={fileInputRef}
                              onChange={handleFileUpload}
                              className="hidden"
                            />
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isUploading}
                              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded flex items-center justify-center transition-all disabled:opacity-50"
                              title="Upload Voucher Receipt"
                            >
                              {isUploading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Upload className="w-4 h-4" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="px-3 py-2 text-xs text-gray-700 bg-gray-50 rounded border border-transparent">
                        {isVoucher && formData[header] ? (
                          <a 
                            href={formData[header]} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-teal-600 hover:underline flex items-center gap-1"
                          >
                            <LinkIcon className="w-3 h-3" />
                            View Voucher
                          </a>
                        ) : isAmount ? (
                          <span className="font-semibold text-teal-800">
                            {Number(formData[header] || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : (
                          formData[header] || "N/A"
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </form>

          {isEditing && (
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <Save className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save Expense
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
