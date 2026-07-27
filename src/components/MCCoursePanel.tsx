import React, { useState, useEffect } from "react";
import MCCourseDetails from "./MCCourseDetails";
import SideEdit from "./SideEdit";

interface MCCoursePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  onDelete: (row: any) => Promise<void>;
  initialData?: any;
  defaultData?: any;
  headers: string[];
  onDirtyChange?: (isDirty: boolean) => void;
  allData?: any[];
  employees?: any[];
  allBatches?: any[];
  onSaveBatch?: (formData: any, editingRow: any | null) => Promise<void>;
  allDocuments?: any[];
  onSaveDocument?: (formData: any, editingRow: any | null) => Promise<void>;
  workflowData?: any[];
  onExpand?: (course: any) => void;
  expensesData?: any[];
  onSaveExpense?: (formData: any, editingRow: any | null) => Promise<void>;
  expensesHeaders?: string[];
  batchHeaders?: string[];
  documentHeaders?: string[];
  extraFormProps?: any;
  [key: string]: any;
}

export default function MCCoursePanel({ 
  isOpen, 
  onClose, 
  onSave, 
  initialData, 
  headers,
  employees,
  allBatches,
  onSaveBatch,
  allDocuments,
  onSaveDocument,
  workflowData = [],
  onExpand,
  expensesData,
  onSaveExpense,
  expensesHeaders,
  batchHeaders,
  documentHeaders,
  extraFormProps,
  ...rest
}: MCCoursePanelProps) {
  const [isEditing, setIsEditing] = useState(!initialData);

  useEffect(() => {
    if (isOpen) {
      setIsEditing(!initialData);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  if (isEditing) {
    return (
      <SideEdit
        isOpen={isOpen}
        onClose={() => {
          if (initialData) {
            setIsEditing(false);
          } else {
            onClose();
          }
        }}
        onSave={async (data) => {
          await onSave(data);
          if (initialData) setIsEditing(false);
        }}
        initialData={initialData}
        headers={headers}
        title={initialData ? "Edit Course" : "Add New Course"}
        employees={employees}
        workflowData={workflowData}
        allBatches={allBatches}
        onSaveBatch={onSaveBatch}
      />
    );
  }

  const mergedExtraProps = {
    onSaveBatch: onSaveBatch || extraFormProps?.onSaveBatch,
    onSaveDocument: onSaveDocument || extraFormProps?.onSaveDocument,
    batchHeaders: batchHeaders || extraFormProps?.batchHeaders || ["Batch Number", "Start Date", "End Date", "Student", "Instractor", "Course Fee", "Discount"],
    documentHeaders: documentHeaders || extraFormProps?.documentHeaders || ["Date", "Documents Title", "File Link", "Tag"],
    expensesData: expensesData || extraFormProps?.expensesData,
    onSaveExpense: onSaveExpense || extraFormProps?.onSaveExpense,
    expensesHeaders: expensesHeaders || extraFormProps?.expensesHeaders,
    ...extraFormProps
  };

  return (
    <MCCourseDetails
      isOpen={isOpen}
      onClose={onClose}
      data={initialData}
      onSave={onSave}
      employees={employees}
      batches={allBatches}
      documents={allDocuments}
      workflowData={workflowData}
      extraFormProps={mergedExtraProps}
      initialExpanded={false}
      headers={headers}
    />
  );
}
