import React, { useState, useMemo, useEffect, useRef } from "react";
import { resolveNamesOrIdsToIds, isBatchRunning, formatToMmmDdYyyy, parseWorkflowAndStages, getStageAssignment, cn, serializeWorkflowAndStages, parseWorkflowTitle } from "../lib/utils";
import { Users, Calendar, Info, Briefcase, FileText, Plus, Clock, Save, Check, ExternalLink, Trash2, Edit3, X, Search, ChevronDown, Video, Building2, DollarSign, TrendingUp, Percent, Coins, TrendingDown, Wallet, Banknote, Upload } from "lucide-react";
import axios from "axios";
import { FOLDER_LOCATIONS } from "../FolderLocation";
import EmployeeMultiSelect from "./EmployeeMultiSelect";
import WorkflowTimeline from "./WorkflowTimeline";
import { motion, AnimatePresence } from "motion/react";
import SearchableSingleSelect from "./SearchableSingleSelect";

export interface RoutineItem {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  note?: string;
  classMode?: 'online' | 'offline';
}

const formatTime12h = (timeStr: string) => {
  if (!timeStr) return "—";
  if (timeStr.toLowerCase().includes("am") || timeStr.toLowerCase().includes("pm")) return timeStr;
  const [h, m] = timeStr.split(":");
  if (!h || m === undefined) return timeStr;
  let hour = parseInt(h, 10);
  if (isNaN(hour)) return timeStr;
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${String(hour).padStart(2, "0")}:${m} ${ampm}`;
};

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return "—";
  return formatToMmmDdYyyy(dateStr);
};

const sortRoutineItemsByDate = (items: RoutineItem[]): RoutineItem[] => {
  return [...items].sort((a, b) => {
    const getTime = (d: string) => {
      if (!d) return 0;
      const parsed = Date.parse(d);
      if (!isNaN(parsed)) return parsed;
      const dateObj = new Date(d);
      return isNaN(dateObj.getTime()) ? 0 : dateObj.getTime();
    };
    const timeA = getTime(a.date);
    const timeB = getTime(b.date);
    if (timeA !== timeB) return timeA - timeB;
    return (a.startTime || "").localeCompare(b.startTime || "");
  });
};

const parseBatchRoutine = (rawVal: any): { items: RoutineItem[]; textNote: string } => {
  if (!rawVal) return { items: [], textNote: "" };
  const str = String(rawVal).trim();
  if (!str) return { items: [], textNote: "" };

  if (str.startsWith("[") && str.endsWith("]")) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        const validItems: RoutineItem[] = parsed.map((it: any, idx: number) => ({
          id: it.id || `routine-${idx}-${Date.now()}`,
          date: it.date || "",
          startTime: it.startTime || "",
          endTime: it.endTime || "",
          note: it.note || "",
          classMode: it.classMode || undefined
        }));
        return { items: sortRoutineItemsByDate(validItems), textNote: "" };
      }
    } catch (e) {
      // fallback
    }
  }
  return { items: [], textNote: str };
};

const getPhotoUrl = (emp: any) => {
  if (!emp) return 'https://ui-avatars.com/api/?name=User&background=0D9488&color=fff';
  const photoKey = Object.keys(emp).find(k => {
    const lk = k.toLowerCase().trim();
    return lk.includes("photo") || lk.includes("image") || lk.includes("picture") || lk.includes("avatar") || lk === "img" || lk.includes("profile");
  });
  const rawUrl = photoKey ? emp[photoKey] : '';
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(emp['Employee Name'] || 'User') + '&background=0D9488&color=fff';
  }
  const cleanUrl = rawUrl.trim();
  const fileIdMatch = cleanUrl.match(/[-\w]{25,}/);
  if (fileIdMatch && (cleanUrl.includes('drive.google.com') || cleanUrl.includes('docs.google.com'))) {
    return `https://drive.google.com/thumbnail?id=${fileIdMatch[0]}&sz=w400`;
  }
  return cleanUrl;
};

const toInputDateValue = (dateStr: any) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getRoomsFromGoogleSheetBatches = (allBatches?: any[], currentBatch?: any): string[] => {
  const roomsSet = new Set<string>();

  const processBatchVal = (rawVal: any) => {
    if (!rawVal) return;
    const { items, textNote } = parseBatchRoutine(rawVal);
    items.forEach((it) => {
      if (it.note) {
        const val = it.note.trim();
        if (val && !val.startsWith("http://") && !val.startsWith("https://") && !val.toLowerCase().includes("meet.google.com")) {
          roomsSet.add(val);
        }
      }
    });
    if (textNote) {
      const val = textNote.trim();
      if (val && !val.startsWith("http://") && !val.startsWith("https://") && !val.toLowerCase().includes("meet.google.com") && val.length < 35) {
        roomsSet.add(val);
      }
    }
  };

  // Process unique room numbers from direct Class Routine sheet slots stored in localStorage
  try {
    const routineSlotsCached = localStorage.getItem("routine_slots_data");
    if (routineSlotsCached) {
      const parsedSlots = JSON.parse(routineSlotsCached);
      if (Array.isArray(parsedSlots)) {
        parsedSlots.forEach((slot) => {
          const val = slot["Room No / Class Link"] || slot["roomNoClassLink"] || slot["Room No"] || slot["roomNo"];
          if (val && typeof val === "string") {
            const trimmed = val.trim();
            if (
              trimmed && 
              !trimmed.startsWith("http://") && 
              !trimmed.startsWith("https://") && 
              !trimmed.toLowerCase().includes("meet.google.com") && 
              !trimmed.toLowerCase().includes("zoom.us")
            ) {
              roomsSet.add(trimmed);
            }
          }
        });
      }
    }
  } catch (e) {
    console.warn("Failed to parse routine_slots_data from localStorage", e);
  }

  if (Array.isArray(allBatches)) {
    allBatches.forEach((b) => {
      processBatchVal(b["Routine"] || b["routine"] || b["Class Routine"]);
    });
  }

  if (currentBatch) {
    processBatchVal(currentBatch["Routine"] || currentBatch["routine"] || currentBatch["Class Routine"]);
  }

  try {
    const cached = localStorage.getItem("batch_list_data");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        parsed.forEach((b) => processBatchVal(b["Routine"] || b["routine"] || b["Class Routine"]));
      }
    }
  } catch (e) {
    // ignore
  }

  return Array.from(roomsSet);
};

interface RoomSelectProps {
  value: string;
  onChange: (val: string) => void;
  allBatches?: any[];
  batch?: any;
}

function RoomSelect({ value, onChange, allBatches, batch }: RoomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [customSavedRooms, setCustomSavedRooms] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("saved_room_numbers");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  const roomsList = useMemo(() => {
    const extractedFromSheet = getRoomsFromGoogleSheetBatches(allBatches, batch);
    const combined = Array.from(new Set([...extractedFromSheet, ...customSavedRooms]));
    return combined;
  }, [allBatches, batch, customSavedRooms]);

  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus();
    } else {
      setSearch("");
    }
  }, [isOpen]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  const filteredRooms = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return roomsList;
    return roomsList.filter((r) => r.toLowerCase().includes(trimmed));
  }, [roomsList, search]);

  const exactMatchExists = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return true;
    return roomsList.some((r) => r.toLowerCase() === trimmed);
  }, [roomsList, search]);

  const handleAddNewRoom = (newRoomName: string) => {
    const trimmed = newRoomName.trim();
    if (!trimmed) return;
    const updated = Array.from(new Set([...customSavedRooms, trimmed]));
    setCustomSavedRooms(updated);
    try {
      localStorage.setItem("saved_room_numbers", JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    onChange(trimmed);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="w-full">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:border-teal-500 outline-none bg-white cursor-pointer font-medium flex items-center justify-between shadow-2xs hover:border-slate-300 transition-colors"
      >
        <span className={value ? "text-slate-800 font-semibold" : "text-slate-400"}>
          {value || "Select Room No"}
        </span>
        <div className="flex items-center gap-1 text-slate-400 shrink-0">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <ChevronDown className="w-3.5 h-3.5" />
        </div>
      </div>

      {isOpen && (
        <div className="absolute top-0 bottom-0 left-0 w-36 sm:w-40 bg-white border-r border-slate-200 shadow-2xl z-50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-left duration-200">
          <div className="p-2 px-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="p-1 rounded bg-teal-100/60 text-teal-700 shrink-0">
                <Building2 className="w-3 h-3" />
              </div>
              <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wide truncate">
                Room No
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-0.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded transition-colors cursor-pointer shrink-0"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-1.5 border-b border-slate-100 bg-white shrink-0">
            <div className="relative flex items-center">
              <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-md pl-6 pr-1.5 py-1 text-[11px] text-slate-800 focus:bg-white focus:border-teal-500 outline-none font-medium transition-all"
              />
            </div>
          </div>

          <div className="overflow-y-auto p-1 flex-1 space-y-0.5">
            {filteredRooms.length > 0 &&
              filteredRooms.map((roomOpt, idx) => {
                const isSelected = value === roomOpt;
                return (
                  <div
                    key={idx}
                    onClick={() => {
                      onChange(roomOpt);
                      setIsOpen(false);
                    }}
                    className={`px-2 py-1.5 text-xs rounded-md cursor-pointer flex items-center justify-between transition-colors ${
                      isSelected
                        ? "bg-teal-50 text-teal-900 font-bold border border-teal-200/60"
                        : "text-slate-700 hover:bg-slate-100/80 font-medium"
                    }`}
                  >
                    <span className="truncate">{roomOpt}</span>
                    {isSelected && <Check className="w-3 h-3 text-teal-600 shrink-0 ml-1" />}
                  </div>
                );
              })}

            {search.trim() && !exactMatchExists && (
              <div
                onClick={() => handleAddNewRoom(search)}
                className="px-2 py-1.5 text-[11px] text-teal-700 bg-teal-50 hover:bg-teal-100 cursor-pointer font-bold flex items-center gap-1 rounded-md border border-teal-200/80 transition-colors mt-1 leading-tight"
              >
                <Plus className="w-3 h-3 text-teal-600 shrink-0" />
                <span className="truncate">Add &quot;{search.trim()}&quot;</span>
              </div>
            )}

            {filteredRooms.length === 0 && !search.trim() && (
              <div className="px-2 py-4 text-[11px] text-slate-400 text-center">
                No rooms available
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export interface BatchDetailsViewProps {
  batch: any;
  allBatches?: any[];
  employees?: any[];
  isEditing?: boolean;
  onSaveBatch?: (batchData: any) => Promise<void>;
  workflowData?: any[];
  documents?: any[];
  onSaveDocument?: (formData: any, editingRow: any | null) => Promise<void>;
  courseFee?: any;
  expensesData?: any[];
  onSaveExpense?: (formData: any, editingRow: any | null) => Promise<void>;
  expensesHeaders?: string[];
}

export default function BatchDetailsView({ 
  batch, 
  allBatches, 
  employees, 
  isEditing, 
  onSaveBatch, 
  workflowData = [], 
  documents = [], 
  onSaveDocument, 
  courseFee,
  expensesData,
  onSaveExpense,
  expensesHeaders
}: BatchDetailsViewProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'routine' | 'workflow' | 'documents' | 'financial'>('info');
  const [documentFilter, setDocumentFilter] = useState<string | null>(null);
  
  const [routineItems, setRoutineItems] = useState<RoutineItem[]>(() => {
    const raw = batch?.["Routine"] || batch?.["routine"] || batch?.["Class Routine"] || "";
    return parseBatchRoutine(raw).items;
  });
  const [routineTextNote, setRoutineTextNote] = useState<string>(() => {
    const raw = batch?.["Routine"] || batch?.["routine"] || batch?.["Class Routine"] || "";
    return parseBatchRoutine(raw).textNote;
  });

  const [inputDate, setInputDate] = useState<string>("");
  const [inputStartTime, setInputStartTime] = useState<string>("");
  const [inputEndTime, setInputEndTime] = useState<string>("");
  const [inputNote, setInputNote] = useState<string>("");
  const [classMode, setClassMode] = useState<'offline' | 'online'>('offline');
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);



  const [isSavingRoutine, setIsSavingRoutine] = useState<boolean>(false);
  const [routineSavedSuccess, setRoutineSavedSuccess] = useState<boolean>(false);

  // Voucher and Expenses Form states
  const [showVoucherForm, setShowVoucherForm] = useState<boolean>(false);
  const [voucherTitle, setVoucherTitle] = useState<string>("");
  const [voucherAmount, setVoucherAmount] = useState<string>("");
  const [voucherDate, setVoucherDate] = useState<string>("");
  const [voucherFileUrl, setVoucherFileUrl] = useState<string>("");
  const [isUploadingVoucher, setIsUploadingVoucher] = useState<boolean>(false);
  const [isSavingVoucher, setIsSavingVoucher] = useState<boolean>(false);

  const calculatedExpensesSum = useMemo(() => {
    if (!expensesData || !Array.isArray(expensesData)) {
      const expensesVal = batch?.["Expenses"] || "0";
      return parseFloat(String(expensesVal).replace(/[^0-9.]/g, "")) || 0;
    }
    const targetTag = `${batch?.["Course Code"] || ""}-${batch?.["Batch Number"] || ""}`.trim().toLowerCase();
    return expensesData.reduce((sum, item) => {
      const itemTag = String(item["Tag"] || "").trim().toLowerCase();
      if (itemTag === targetTag) {
        const amountVal = parseFloat(String(item["Amount"] || "0").replace(/[^0-9.]/g, ""));
        return sum + (isNaN(amountVal) ? 0 : amountVal);
      }
      return sum;
    }, 0);
  }, [expensesData, batch]);

  // Synchronize dynamic calculated expenses to the batch "Expenses" property
  useEffect(() => {
    if (isEditing && onSaveBatch && calculatedExpensesSum !== undefined) {
      const currentBatchExpenses = parseFloat(String(batch?.["Expenses"] || "0").replace(/[^0-9.]/g, "")) || 0;
      if (calculatedExpensesSum !== currentBatchExpenses) {
        onSaveBatch({
          ...batch,
          "Expenses": String(calculatedExpensesSum)
        });
      }
    }
  }, [calculatedExpensesSum, isEditing, batch, onSaveBatch]);

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

  const handleVoucherFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const courseCode = batch?.["Course Code"] || "";
    const batchNo = batch?.["Batch Number"] || "";
    if (!courseCode || !batchNo) {
      alert("Course Code or Batch Number is missing. Cannot determine folder path.");
      return;
    }

    setIsUploadingVoucher(true);
    const formDataUpload = new FormData();

    // Calculate Ref number
    const refHeader = "Ref";
    const tag = `${courseCode}-${batchNo}`;
    const targetTag = tag.toLowerCase();
    const sameTagExpenses = (expensesData || []).filter(item => {
      const itemTag = String(item["Tag"] || "").trim().toLowerCase();
      return itemTag === targetTag;
    });

    let maxSerial = 0;
    sameTagExpenses.forEach(item => {
      const refVal = String(item[refHeader] || item["Ref Name"] || "");
      if (refVal.includes("/")) {
        const parts = refVal.split("/");
        const lastPart = parts[parts.length - 1];
        const serial = parseInt(lastPart, 10);
        if (!isNaN(serial) && serial > maxSerial) {
          maxSerial = serial;
        }
      }
    });

    const nextSerial = maxSerial + 1;
    const refNumber = `${courseCode}/${batchNo}/${nextSerial}`;

    const fileLocationPrefix = FOLDER_LOCATIONS.BANNER.replace(/\/Banner$/, "") || "Main Folder";
    const customFolderPath = `${fileLocationPrefix}/MC Course/${courseCode}/${batchNo}/Expense Voucher`;

    formDataUpload.append("file", file);
    formDataUpload.append("folderPath", customFolderPath);
    formDataUpload.append("departmentName", refNumber); 

    try {
      const response = await axios.post("/api/upload", formDataUpload, { timeout: 60000 });
      const uploadedUrl = response.data?.url || response.data?.fileLink;
      if (uploadedUrl) {
        let viewUrl = uploadedUrl;
        if (viewUrl.includes("drive.google.com/uc") || viewUrl.includes("export=download")) {
          const fileIdMatch = viewUrl.match(/[?&]id=([^&]+)/);
          if (fileIdMatch && fileIdMatch[1]) {
            viewUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/view`;
          }
        }
        setVoucherFileUrl(viewUrl);
      }
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Upload failed. Please try again.");
    } finally {
      setIsUploadingVoucher(false);
    }
  };

  const handleSaveVoucherSubmit = async () => {
    if (!voucherTitle || !voucherAmount) return;
    setIsSavingVoucher(true);
    try {
      if (onSaveExpense) {
        const courseCode = batch?.["Course Code"] || "";
        const batchNo = batch?.["Batch Number"] || "";
        const tag = `${courseCode}-${batchNo}`;
        const refHeader = "Ref";

        const sameTagExpenses = (expensesData || []).filter(item => {
          const itemTag = String(item["Tag"] || "").trim().toLowerCase();
          return itemTag === tag.toLowerCase();
        });

        let maxSerial = 0;
        sameTagExpenses.forEach(item => {
          const refVal = String(item[refHeader] || item["Ref Name"] || "");
          if (refVal.includes("/")) {
            const parts = refVal.split("/");
            const lastPart = parts[parts.length - 1];
            const serial = parseInt(lastPart, 10);
            if (!isNaN(serial) && serial > maxSerial) {
              maxSerial = serial;
            }
          }
        });

        const nextSerial = maxSerial + 1;
        const refNumber = `${courseCode}/${batchNo}/${nextSerial}`;

        const newVoucher = {
          "Date": voucherDate || new Date().toISOString().split('T')[0],
          "Expenses Title": voucherTitle,
          "Amount": voucherAmount,
          "Voucher": voucherFileUrl,
          "Tag": tag,
          "Ref": refNumber
        };
        await onSaveExpense(newVoucher, null);
        setShowVoucherForm(false);
        setVoucherTitle("");
        setVoucherAmount("");
        setVoucherFileUrl("");
      }
    } catch (e) {
      console.error("Voucher save failed:", e);
    } finally {
      setIsSavingVoucher(false);
    }
  };

  useEffect(() => {
    const raw = batch?.["Routine"] || batch?.["routine"] || batch?.["Class Routine"] || "";
    const parsed = parseBatchRoutine(raw);
    setRoutineItems(parsed.items);
    setRoutineTextNote(parsed.textNote);
  }, [batch]);

  const sortedRoutineItems = useMemo(() => {
    return sortRoutineItemsByDate(routineItems);
  }, [routineItems]);

  const parsedWorkflows = useMemo(() => {
    if (!Array.isArray(workflowData)) return [];
    return workflowData.map(row => {
      const idKey = Object.keys(row).find(h => {
        const cleaned = h.trim().toLowerCase();
        return cleaned === "workflow title" || cleaned === "title";
      }) || Object.keys(row)[0] || "Workflow Title";
      
      const rawText = String(row[idKey] || "");
      const structured = parseWorkflowTitle(rawText);
      return {
        id: structured.id,
        title: structured.title || rawText || "",
        stages: structured.stages || [],
        rawText
      };
    }).filter(item => item.title.trim() !== "");
  }, [workflowData]);
  
  const instructorVal = batch ? (batch["Instractor"] || batch["Instructor"]) : "";
  
  const instructorIds = useMemo(() => {
    if (!instructorVal || String(instructorVal).trim() === "") return [];
    return resolveNamesOrIdsToIds(String(instructorVal), employees || []).map(String);
  }, [instructorVal, employees]);
  
  if (!batch) {
    return (
      <div className="h-full flex-1 w-full flex items-center justify-center text-slate-400 italic text-sm">
        No batch selected.
      </div>
    );
  }
  
  const getInstructorList = () => {
    if (!instructorVal || String(instructorVal).trim() === "") return [];
    
    const empList = employees || [];
    // First try resolveNamesOrIdsToIds
    const instructorIds = resolveNamesOrIdsToIds(String(instructorVal), empList);
    
    const resolvedFromIds = instructorIds.map(rawId => {
      const cleanId = String(rawId).split('|')[0].trim();
      return empList.find(e => {
        const empId = String(e['Employee ID'] || '').trim();
        const empName = String(e['Employee Name'] || '').trim();
        return (
          empId === cleanId || 
          empName.toLowerCase() === cleanId.toLowerCase()
        );
      });
    }).filter(Boolean);

    if (resolvedFromIds.length > 0) return resolvedFromIds;

    // Fallback split by comma or semicolon
    const items = String(instructorVal).split(/[,;]/).map(s => s.trim()).filter(Boolean);
    return items.map(item => {
      const parts = item.split('|').map(p => p.trim());
      const firstPart = parts[0] || '';
      const secondPart = parts[1] || '';

      const found = empList.find(e => {
        const empId = String(e['Employee ID'] || '').trim().toLowerCase();
        const empName = String(e['Employee Name'] || '').trim().toLowerCase();
        const fLower = firstPart.toLowerCase();
        const sLower = secondPart.toLowerCase();

        return (
          (empId && (empId === fLower || empId === sLower)) ||
          (empName && (empName === fLower || empName === sLower || (fLower.length > 2 && empName.includes(fLower))))
        );
      });

      if (found) return found;

      return {
        'Employee Name': secondPart || firstPart,
        Designation: "Instructor"
      };
    });
  };
  
  const instructorsToRender = getInstructorList();
  
  const renderWorkflow = () => {
    const courseWorkflow = batch["Workflow"] || batch["Publication Workflow"] || "";
    const { jobTitle, stageAssignments } = parseWorkflowAndStages(courseWorkflow);

    const handleWorkflowChange = async (newJobTitle: string) => {
      if (onSaveBatch) {
        const matchingWorkflow = parsedWorkflows.find(w => 
          w.id === newJobTitle || w.title.trim().toLowerCase() === newJobTitle.trim().toLowerCase()
        );
        const workflowIdToSave = matchingWorkflow ? matchingWorkflow.id : newJobTitle;
        const serialized = serializeWorkflowAndStages(workflowIdToSave, {});
        await onSaveBatch({
          ...batch,
          Workflow: serialized,
          "Publication Workflow": serialized
        });
      }
    };

    const handleStageAssignmentChange = async (stageId: string, ids: string[]) => {
      if (onSaveBatch) {
        const updatedAssignments = { ...stageAssignments, [stageId]: ids };
        const serialized = serializeWorkflowAndStages(jobTitle, updatedAssignments);
        await onSaveBatch({
          ...batch,
          Workflow: serialized,
          "Publication Workflow": serialized
        });
      }
    };

    const matchingWorkflow = parsedWorkflows.find(w => 
      w.id === jobTitle || w.title.trim().toLowerCase() === jobTitle.trim().toLowerCase()
    );

    let matchingStages = [];
    if (matchingWorkflow && matchingWorkflow.stages.length > 0) {
      matchingStages = matchingWorkflow.stages.map((stage, idx) => {
        let name = stage.stageName || "Unnamed Stage";
        if (!/^\d+\./.test(name)) {
          name = `${idx + 1}. ${name}`;
        }
        return {
          "ID": stage.id,
          "Job Title": jobTitle,
          "Workflow Stage": name,
          "Key Responsibilities": stage.tasks.join(', '),
          "Deliverables": stage.deliverables.join(', ')
        };
      });
    }

    return (
      <div className="space-y-4">
        {isEditing && (
          <div className="space-y-1 bg-white p-3 rounded-md border border-slate-200">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Change Workflow</label>
            <select
              className="w-full text-[11px] font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 focus:border-teal-500 outline-none uppercase tracking-wide cursor-pointer"
              value={jobTitle || ''}
              onChange={(e) => handleWorkflowChange(e.target.value)}
            >
              <option value="">-- SELECT JOB TITLE --</option>
              {parsedWorkflows.map((w, idx) => (
                <option key={idx} value={w.id}>{w.title}</option>
              ))}
            </select>
          </div>
        )}

        {jobTitle && !isEditing && (
          <div className="bg-white p-3 rounded-md border border-slate-200 shadow-3xs flex flex-col gap-1">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Job Title / Workflow</span>
            <span className="text-xs font-semibold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-teal-600" />
              {parsedWorkflows.find(w => w.id === jobTitle)?.title || jobTitle}
            </span>
          </div>
        )}

        {!jobTitle ? (
          <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <Briefcase className="w-8 h-8 text-slate-300 mb-2" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">No Workflow Assigned</span>
            <p className="text-[9px] text-slate-400 mt-1 mb-4">No workflow assigned to this batch.</p>
          </div>
        ) : (
          <WorkflowTimeline
            stages={matchingStages}
            stageAssignments={stageAssignments}
            isEditing={isEditing}
            employees={employees || []}
            onStageAssignmentChange={handleStageAssignmentChange}
            placement="right-sidebar"
            jobTitle={jobTitle}
            batch={batch}
            courseCode={batch?.['Course Code']}
            documents={documents}
            onSaveDocument={onSaveDocument}
            viewType="batch"
            onViewDocuments={(filter) => {
              setActiveTab('documents');
              setDocumentFilter(filter);
            }}
          />
        )}
      </div>
    );
  };

  const renderDocuments = () => {
    const batchDocs = documents.filter(doc => {
      const tag = String(doc["Tag"] || "").toUpperCase();
      const title = String(doc["Documents Title"] || doc["Document Title"] || doc["Title"] || "").toUpperCase();
      const docCourseCode = String(doc["Course Code"] || "").toUpperCase();
      const docBatchNum = String(doc["Batch Number"] || doc["Batch"] || "").toUpperCase();

      const batchNum = String(batch?.["Batch Number"] || "").toUpperCase();
      const courseCode = String(batch?.["Course Code"] || "").toUpperCase();

      // Check course match
      const matchCourse = !courseCode || (docCourseCode === courseCode || tag.includes(courseCode) || title.includes(courseCode));
      if (!matchCourse) return false;

      // Check specific batch match
      const matchBatch = !batchNum || (
        docBatchNum === batchNum ||
        tag.includes(`BATCH ${batchNum}`) ||
        tag.includes(`BATCH-${batchNum}`) ||
        tag.includes(`BATCH:${batchNum}`) ||
        tag.includes(`BATCH ${batchNum},`) ||
        tag.includes(`BATCH ${batchNum} `)
      );

      if (!matchBatch) return false;

      if (documentFilter) {
        const normFilter = String(documentFilter).trim().toUpperCase();
        const cleanFilter = normFilter
          .replace(/^[^-]+-[^-]+-/, '')
          .replace(/^[^-]+-/, '')
          .replace(/-$/, '')
          .replace(/^\d+\.\s*/, '');

        const matchTag = tag.includes(normFilter) || tag.startsWith(normFilter) || (cleanFilter.length > 0 && tag.includes(cleanFilter));
        const matchTitle = title.includes(normFilter) || (cleanFilter.length > 0 && title.includes(cleanFilter));
        return matchTag || matchTitle;
      }

      return true;
    });
    
    return (
      <div className="space-y-3">
        {documentFilter && (
          <div className="flex items-center justify-between bg-teal-50 px-3 py-2 rounded-md">
            <span className="text-xs font-bold text-teal-700">Filtered Documents</span>
            <button
              onClick={() => setDocumentFilter(null)}
              className="text-[10px] font-bold text-teal-600 hover:text-teal-800 hover:underline cursor-pointer"
            >
              Clear Filter
            </button>
          </div>
        )}
        {batchDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-slate-200 rounded-md bg-slate-50/50">
            <FileText className="w-8 h-8 text-slate-300 mb-2" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">No Documents</span>
            <p className="text-[9px] text-slate-400 mt-1">{documentFilter ? "No documents match this filter." : "No documents tagged with this batch number."}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {batchDocs.map((doc, idx) => (
              <a 
                key={idx}
                href={doc["File Link"]}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 p-2.5 bg-white border border-slate-200 rounded-md hover:border-teal-300 hover:shadow-sm transition-all group"
              >
                <div className="w-8 h-8 rounded-md bg-teal-50 flex items-center justify-center shrink-0 group-hover:bg-teal-100 transition-colors">
                  <FileText className="w-4 h-4 text-teal-600" />
                </div>
                <div className="flex-1 min-w-0 py-0.5">
                  <h4 className="text-xs font-bold text-slate-800 truncate leading-tight group-hover:text-teal-700 transition-colors">
                    {doc["Documents Title"] || doc["Document Title"] || "Untitled Document"}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">
                      {doc["Date"] ? formatToMmmDdYyyy(doc["Date"]) : "No Date"}
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    );
  };

  const handleAddRoutineSlot = () => {
    if (!inputDate) {
      alert("Please select a date.");
      return;
    }
    if (!inputStartTime) {
      alert("Please select a start time.");
      return;
    }
    if (!inputEndTime) {
      alert("Please select an end time.");
      return;
    }
    if (!inputNote || !inputNote.trim()) {
      alert(classMode === "online" ? "Google Meet / Class Link is required." : "Room Number is required.");
      return;
    }

    const parseTimeToMinutes = (timeStr: string): number => {
      if (!timeStr) return 0;
      const parts = timeStr.split(":");
      if (parts.length < 2) return 0;
      const hours = parseInt(parts[0], 10) || 0;
      const minutes = parseInt(parts[1], 10) || 0;
      return hours * 60 + minutes;
    };

    const startNew = parseTimeToMinutes(inputStartTime);
    const endNew = parseTimeToMinutes(inputEndTime);

    if (endNew <= startNew) {
      alert("End time must be after start time.");
      return;
    }

    const bStart = batch?.["Start Date"] || batch?.["startDate"];
    const bEnd = batch?.["End Date"] || batch?.["endDate"];
    
    if (bStart && bEnd) {
      const dStart = new Date(bStart);
      const dEnd = new Date(bEnd);
      const dInput = new Date(inputDate);
      
      dStart.setHours(0, 0, 0, 0);
      dEnd.setHours(23, 59, 59, 999);
      dInput.setHours(12, 0, 0, 0);
      
      if (dInput < dStart || dInput > dEnd) {
        alert(`Date must be between batch's start date (${formatToMmmDdYyyy(bStart)}) and end date (${formatToMmmDdYyyy(bEnd)}).`);
        return;
      }
    } else {
      alert("This batch does not have a Start Date and End Date configured. Please set them first.");
      return;
    }

    if (classMode === "offline" && inputNote && inputNote.trim()) {
      const roomLower = inputNote.trim().toLowerCase();
      
      let conflictBatchName = "";
      let conflictStartTime = "";
      let conflictEndTime = "";
      
      const hasConflict = (allBatches || []).some(b => {
        const rawRoutine = b["Routine"] || b["routine"] || b["Class Routine"] || "";
        const items = parseBatchRoutine(rawRoutine).items;
        
        return items.some(item => {
          if (editingItemId && item.id === editingItemId) return false;
          if (item.date !== inputDate) return false;
          if (!item.note || item.note.trim().toLowerCase() !== roomLower) return false;
          
          const startExisting = parseTimeToMinutes(item.startTime);
          const endExisting = parseTimeToMinutes(item.endTime);
          
          const overlaps = startNew < endExisting && startExisting < endNew;
          if (overlaps) {
            const bCourse = b["Course Code"] || b["courseCode"] || b["Course Code"] || "";
            const bNum = b["Batch Number"] || b["batchNumber"] || "";
            conflictBatchName = `${bCourse} Batch ${bNum}`;
            conflictStartTime = item.startTime;
            conflictEndTime = item.endTime;
            return true;
          }
          return false;
        });
      });
      
      if (hasConflict) {
        alert(`Room "${inputNote.trim()}" is already booked on this date from ${formatTime12h(conflictStartTime)} to ${formatTime12h(conflictEndTime)} (${conflictBatchName}).`);
        return;
      }
    }

    let newRoutineItems: RoutineItem[] = [];
    if (editingItemId) {
      newRoutineItems = routineItems.map(item => item.id === editingItemId ? {
        ...item,
        date: inputDate,
        startTime: inputStartTime,
        endTime: inputEndTime,
        note: inputNote,
        classMode: classMode
      } : item);
      setEditingItemId(null);
    } else {
      const newItem: RoutineItem = {
        id: `slot-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        date: inputDate,
        startTime: inputStartTime,
        endTime: inputEndTime,
        note: inputNote,
        classMode: classMode
      };
      newRoutineItems = [...routineItems, newItem];
    }

    newRoutineItems = sortRoutineItemsByDate(newRoutineItems);
    setRoutineItems(newRoutineItems);
    setInputDate("");
    setInputStartTime("");
    setInputEndTime("");
    setInputNote("");
    setClassMode("offline");
    setShowAddForm(false);

    if (onSaveBatch) {
      const savedVal = JSON.stringify(newRoutineItems);
      onSaveBatch({
        ...batch,
        "Routine": savedVal,
        "Class Routine": savedVal
      });
    }
  };

  const handleEditRoutineSlot = (item: RoutineItem) => {
    setEditingItemId(item.id);
    setInputDate(item.date);
    setInputStartTime(item.startTime);
    setInputEndTime(item.endTime);
    setInputNote(item.note || "");
    const isOnline = item.classMode === 'online' || (item.note && (item.note.startsWith('http') || item.note.toLowerCase().includes('meet.google.com')));
    setClassMode(isOnline ? 'online' : 'offline');
    setShowAddForm(true);
  };

  const handleDeleteRoutineSlot = (id: string) => {
    const newRoutineItems = sortRoutineItemsByDate(routineItems.filter(item => item.id !== id));
    setRoutineItems(newRoutineItems);
    if (editingItemId === id) {
      setEditingItemId(null);
      setInputDate("");
      setInputStartTime("");
      setInputEndTime("");
      setInputNote("");
      setClassMode("offline");
    }
    if (onSaveBatch) {
      const savedVal = JSON.stringify(newRoutineItems);
      onSaveBatch({
        ...batch,
        "Routine": savedVal,
        "Class Routine": savedVal
      });
    }
  };

  const handleCancelForm = () => {
    setEditingItemId(null);
    setInputDate("");
    setInputStartTime("");
    setInputEndTime("");
    setInputNote("");
    setClassMode("offline");
    setShowAddForm(false);
  };

  const handleSaveRoutine = async () => {
    if (!onSaveBatch) return;
    setIsSavingRoutine(true);
    try {
      let savedVal = "";
      if (routineItems.length > 0) {
        savedVal = JSON.stringify(routineItems);
      } else if (routineTextNote.trim()) {
        savedVal = routineTextNote.trim();
      }

      const updatedBatch = {
        ...batch,
        "Routine": savedVal,
        "Class Routine": savedVal
      };
      await onSaveBatch(updatedBatch);
      setRoutineSavedSuccess(true);
      setTimeout(() => setRoutineSavedSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save class routine:", err);
    } finally {
      setIsSavingRoutine(false);
    }
  };

  const renderRoutine = () => {
    return (
      <div className="space-y-4 pt-1">
        <div className="relative bg-white rounded-xl border border-slate-200 p-4 shadow-3xs space-y-4 overflow-hidden">
          {/* Top Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-teal-50 border border-teal-150 text-teal-600">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Class Routine Schedule</h4>
                <p className="text-[10px] text-slate-500">Set dates, start & end times for class routines</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!showAddForm && (
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-700 rounded-lg text-[11px] font-bold transition-all cursor-pointer shadow-2xs hover:scale-102"
                >
                  <Plus className="w-3.5 h-3.5 text-teal-600" />
                  Add Schedule
                </button>
              )}
            </div>
          </div>

          {/* Add / Edit Form Card */}
          {showAddForm && (
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-teal-600" />
                  {editingItemId ? "Edit Routine Slot" : "Add New Routine Slot"}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddRoutineSlot}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer shadow-2xs"
                  >
                    {editingItemId ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    {editingItemId ? "Update" : "Add"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelForm}
                    className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-md transition-colors"
                    title="Close form"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Date Selector */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Select Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={inputDate}
                    onChange={(e) => setInputDate(e.target.value)}
                    className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all"
                  />
                </div>

                {/* Start Time */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={inputStartTime}
                    onChange={(e) => setInputStartTime(e.target.value)}
                    className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all"
                  />
                </div>

                {/* End Time */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={inputEndTime}
                    onChange={(e) => setInputEndTime(e.target.value)}
                    className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Class Mode & Room / Online Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start pt-1">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Class Mode
                  </label>
                  <div className="flex items-center gap-1.5 p-1 bg-slate-200/60 rounded-lg w-full sm:w-fit border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setClassMode('offline')}
                      className={`flex-1 sm:flex-none px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        classMode === 'offline'
                          ? 'bg-white text-teal-800 shadow-2xs border border-slate-200/80'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      Offline
                    </button>
                    <button
                      type="button"
                      onClick={() => setClassMode('online')}
                      className={`flex-1 sm:flex-none px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        classMode === 'online'
                          ? 'bg-teal-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Video className="w-3.5 h-3.5" />
                      Online
                    </button>
                  </div>
                </div>

                {classMode === 'online' ? (
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Google Meet / Online Link
                    </label>
                    <div className="relative flex items-center">
                      <Video className="w-4 h-4 text-teal-600 absolute left-2.5 shrink-0 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="https://meet.google.com/..."
                        value={inputNote}
                        onChange={(e) => setInputNote(e.target.value)}
                        className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg pl-8 pr-2.5 py-2 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Room No
                    </label>
                    <RoomSelect
                      value={inputNote}
                      onChange={(val) => setInputNote(val)}
                      allBatches={allBatches}
                      batch={batch}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Routine Table */}
          <div className="space-y-2">
            {sortedRoutineItems.length > 0 ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-3xs bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200">
                        <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-r border-slate-100">Date</th>
                        <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-r border-slate-100 text-center">Start Time</th>
                        <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-r border-slate-100 text-center">End Time</th>
                        <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-r border-slate-100">Room</th>
                        <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedRoutineItems.map((item, index) => (
                        <tr key={item.id || index} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-3 py-2 font-bold text-slate-800 border-r border-slate-100 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                              <span>{formatDateDisplay(item.date)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-slate-700 font-semibold text-center border-r border-slate-100 whitespace-nowrap">
                            <span className="inline-block px-2 py-0.5 bg-slate-100 rounded text-slate-800">
                              {formatTime12h(item.startTime)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-700 font-semibold text-center border-r border-slate-100 whitespace-nowrap">
                            <span className="inline-block px-2 py-0.5 bg-slate-100 rounded text-slate-800">
                              {formatTime12h(item.endTime)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-600 border-r border-slate-100 max-w-[180px] truncate">
                            {item.classMode === 'online' || (item.note && (item.note.startsWith("http") || item.note.toLowerCase().includes("meet.") || item.note.toLowerCase().includes("zoom.") || item.note.toLowerCase().includes("teams."))) ? (
                              item.note && item.note.trim() ? (
                                <a
                                  href={item.note.startsWith("http") ? item.note : `https://${item.note}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-800 font-bold text-xs underline decoration-teal-300 underline-offset-2 hover:decoration-teal-600 transition-colors"
                                  title={item.note}
                                >
                                  <Video className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                                  <span>Online</span>
                                  <ExternalLink className="w-3 h-3 text-teal-500 shrink-0" />
                                </a>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-teal-700 font-semibold text-xs">
                                  <Video className="w-3.5 h-3.5 text-teal-600 shrink-0" /> Online
                                </span>
                              )
                            ) : (
                              <span className="font-medium text-slate-800">{item.note || "—"}</span>
                            )}
                          </td>
                          {true && (
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleEditRoutineSlot(item)}
                                  title="Edit Slot"
                                  className="p-1 hover:bg-teal-50 text-slate-500 hover:text-teal-600 rounded transition-colors cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRoutineSlot(item.id)}
                                  title="Delete Slot"
                                  className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-2">
                <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-600">No Routine Scheduled Yet</p>
                <p className="text-[10px] text-slate-400 max-w-sm mx-auto">
                  Click Add Schedule above to select a Date, Start Time, and End Time for class routines.
                </p>
              </div>
            )}
          </div>

          {/* Legacy text note if present */}
          {routineTextNote && routineItems.length === 0 && (
            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg space-y-1">
              <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">
                Existing Text Routine
              </span>
              <p className="text-xs text-amber-900 font-medium">{routineTextNote}</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderFinancial = () => {
    const feeVal = batch["Course Fee"] !== undefined ? batch["Course Fee"] : (courseFee || "0");
    const fee = parseFloat(String(feeVal).replace(/[^0-9.]/g, "")) || 0;

    const enrolledVal = batch["Student"] || batch["Enrolled"] || batch["Enrollments"] || "0";
    const enrolled = parseInt(String(enrolledVal).replace(/[^0-9.]/g, ""), 10) || 0;

    const grossRevenue = fee * enrolled;

    const discountVal = batch["Discount"] || "0";
    const discount = parseFloat(String(discountVal).replace(/[^0-9.]/g, "")) || 0;

    const netRevenue = grossRevenue - (discount * enrolled);

    const expensesVal = batch["Expenses"] || "0";
    const expenses = calculatedExpensesSum !== undefined ? calculatedExpensesSum : (parseFloat(String(expensesVal).replace(/[^0-9.]/g, "")) || 0);

    const netProfit = netRevenue - expenses;

    const profitMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

    return (
      <div className="space-y-3 pt-1">
        {/* Main calculated cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs flex flex-col justify-between">
            <div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Gross Revenue</span>
              <p className="text-[13px] font-bold text-slate-800 font-mono">৳ {grossRevenue.toLocaleString()}</p>
            </div>
            <span className="text-[8px] text-slate-400 mt-1 block italic">Course Fee × Enrolled</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs flex flex-col justify-between">
            <div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Net Revenue</span>
              <p className="text-[13px] font-bold text-teal-600 font-mono">৳ {netRevenue.toLocaleString()}</p>
            </div>
            <span className="text-[8px] text-slate-400 mt-1 block italic">Gross − (Discount × Enrolled)</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs flex flex-col justify-between">
            <div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Net Profit</span>
              <p className={cn("text-[13px] font-bold font-mono", netProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>
                {netProfit < 0 ? "− " : ""}৳ {Math.abs(netProfit).toLocaleString()}
              </p>
            </div>
            <span className="text-[8px] text-slate-400 mt-1 block italic">Net Revenue − Expenses</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs flex flex-col justify-between">
            <div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Profit Margin</span>
              <p className={cn("text-[13px] font-extrabold font-mono", netProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>
                {profitMargin.toFixed(1)}%
              </p>
            </div>
            <span className="text-[8px] text-slate-400 mt-1 block italic">% of Net Revenue</span>
          </div>
        </div>

        {/* Breakdown details & inputs */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5 bg-white border border-slate-200 rounded-lg p-3 shadow-2xs">
            {showVoucherForm ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2.5">
                  <span className="text-[10px] font-extrabold text-teal-600 uppercase tracking-wider flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5" /> Add Voucher
                  </span>
                  <button 
                    type="button" 
                    onClick={() => setShowVoucherForm(false)}
                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                <div className="space-y-2.5">
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Expenses Title</label>
                    <input
                      type="text"
                      value={voucherTitle}
                      onChange={(e) => setVoucherTitle(e.target.value)}
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-teal-500 transition-all"
                      placeholder="e.g. Room Rent, Server Cost"
                      required
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Amount (৳)</label>
                      <input
                        type="number"
                        value={voucherAmount}
                        onChange={(e) => setVoucherAmount(e.target.value)}
                        className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-teal-500 transition-all"
                        placeholder="0"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Date</label>
                      <input
                        type="date"
                        value={voucherDate}
                        onChange={(e) => setVoucherDate(e.target.value)}
                        className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-teal-500 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Voucher / File Attachment</label>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={voucherFileUrl}
                        onChange={(e) => setVoucherFileUrl(e.target.value)}
                        className="flex-1 text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-teal-500 transition-all"
                        placeholder="https://example.com/voucher..."
                      />
                      <label className="bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded px-2 py-1 text-[10px] font-bold text-slate-600 cursor-pointer flex items-center justify-center gap-1 transition-colors">
                        <Upload className="w-3 h-3" />
                        <input
                          type="file"
                          onChange={handleVoucherFileUpload}
                          className="hidden"
                          disabled={isUploadingVoucher}
                        />
                      </label>
                    </div>
                    {isUploadingVoucher && (
                      <span className="text-[8px] text-teal-600 flex items-center gap-1 mt-0.5 italic">
                        <span className="w-2 h-2 rounded-full border border-teal-600 border-t-transparent animate-spin inline-block"></span> Uploading...
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Tag (Auto-filled)</label>
                    <input
                      type="text"
                      value={`${batch["Course Code"] || ""}-${batch["Batch Number"] || ""}`}
                      className="w-full text-xs font-mono bg-slate-100 text-slate-500 border border-slate-200 rounded px-2 py-1 outline-none cursor-not-allowed"
                      readOnly
                    />
                  </div>
                  
                  <div className="flex gap-2 pt-1.5">
                    <button
                      type="button"
                      onClick={() => setShowVoucherForm(false)}
                      className="flex-1 text-[10px] font-bold text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 py-1.5 rounded transition-all"
                    >
                      CANCEL
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveVoucherSubmit}
                      disabled={isSavingVoucher || !voucherTitle || !voucherAmount}
                      className="flex-1 text-[10px] font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed py-1.5 rounded shadow-sm hover:shadow transition-all flex items-center justify-center gap-1"
                    >
                      {isSavingVoucher ? "SAVING..." : "SAVE VOUCHER"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <span className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider block mb-2.5 pb-1 border-b border-slate-100">
                  {isEditing ? "Modify Financial Inputs" : "Core Inputs"}
                </span>
                
                {isEditing ? (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Course Fee (৳)</label>
                      <input
                        type="text"
                        value={batch["Course Fee"] !== undefined ? batch["Course Fee"] : (courseFee || "")}
                        onChange={(e) => onSaveBatch && onSaveBatch({ ...batch, "Course Fee": e.target.value })}
                        className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1 focus:border-teal-500 outline-none transition-all"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Enrolled Students</label>
                      <input
                        type="number"
                        value={batch["Student"] || ""}
                        onChange={(e) => onSaveBatch && onSaveBatch({ ...batch, "Student": e.target.value })}
                        className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1 focus:border-teal-500 outline-none transition-all"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Discount Given (৳)</label>
                      <input
                        type="text"
                        value={batch["Discount"] !== undefined ? batch["Discount"] : ""}
                        onChange={(e) => onSaveBatch && onSaveBatch({ ...batch, "Discount": e.target.value })}
                        className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1 focus:border-teal-500 outline-none transition-all"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Expenses (৳)</label>
                      <div className="flex gap-1.5 items-center">
                        <div className="flex-1 text-xs font-mono bg-slate-100 text-slate-600 border border-slate-200 rounded px-2.5 py-1.5">
                          ৳ {expenses.toLocaleString()}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setVoucherTitle("");
                            setVoucherAmount("");
                            setVoucherFileUrl("");
                            setVoucherDate(new Date().toISOString().split('T')[0]);
                            setShowVoucherForm(true);
                          }}
                          className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-600 border border-teal-200 text-[10px] font-extrabold uppercase tracking-wider rounded transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 animate-pulse text-teal-600" /> Add Voucher
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-[11px] text-slate-500">Course Fee</span>
                      <span className="text-[11px] font-semibold text-slate-800 font-mono">৳ {fee.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-[11px] text-slate-500">Enrolled Students</span>
                      <span className="text-[11px] font-semibold text-slate-800 font-mono">{enrolled}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-[11px] text-slate-500">Discount (per Student)</span>
                      <span className="text-[11px] font-semibold text-rose-600 font-mono">− ৳ {discount.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-[11px] text-slate-500">Expenses</span>
                      <span className="text-[11px] font-semibold text-rose-600 font-mono">− ৳ {expenses.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="md:col-span-7 bg-white border border-slate-200 rounded-lg p-3 shadow-2xs">
            <span className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider block mb-2.5 pb-1 border-b border-slate-100">
              Financial Calculations Flow
            </span>
            <div className="space-y-1.5">
              <div className="p-2 bg-slate-50 border border-slate-200/50 rounded-md">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-bold text-slate-700">Gross Revenue</span>
                  <span className="text-xs font-extrabold text-slate-800 font-mono">৳ {grossRevenue.toLocaleString()}</span>
                </div>
                <p className="text-[9px] text-slate-400 leading-tight">
                  Course Fee (<span className="font-mono">৳ {fee.toLocaleString()}</span>) × Enrolled (<span className="font-mono">{enrolled}</span>)
                </p>
              </div>

              <div className="p-2 bg-slate-50 border border-slate-200/50 rounded-md">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-bold text-slate-700">Net Revenue</span>
                  <span className="text-xs font-extrabold text-teal-700 font-mono">৳ {netRevenue.toLocaleString()}</span>
                </div>
                <p className="text-[9px] text-slate-400 leading-tight">
                  Gross Revenue (<span className="font-mono">৳ {grossRevenue.toLocaleString()}</span>) − (Discount (<span className="font-mono">৳ {discount.toLocaleString()}</span>) × Enrolled (<span className="font-mono">{enrolled}</span>))
                </p>
              </div>

              <div className="p-2 bg-slate-50 border border-slate-200/50 rounded-md">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-bold text-slate-700">Net Profit</span>
                  <span className={cn("text-xs font-extrabold font-mono", netProfit >= 0 ? "text-emerald-700" : "text-rose-700")}>
                    ৳ {netProfit.toLocaleString()}
                  </span>
                </div>
                <p className="text-[9px] text-slate-400 leading-tight">
                  Net Revenue (<span className="font-mono">৳ {netRevenue.toLocaleString()}</span>) − Expenses (<span className="font-mono">৳ {expenses.toLocaleString()}</span>)
                </p>
              </div>

              <div className="p-2 bg-slate-50 border border-slate-200/50 rounded-md">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-bold text-slate-700">Profit Margin</span>
                  <span className={cn("text-xs font-extrabold font-mono", netProfit >= 0 ? "text-emerald-700" : "text-rose-700")}>
                    {profitMargin.toFixed(1)}%
                  </span>
                </div>
                <p className="text-[9px] text-slate-400 leading-tight">
                  Net Profit (<span className="font-mono">৳ {netProfit.toLocaleString()}</span>) ÷ Net Revenue (<span className="font-mono">৳ {netRevenue.toLocaleString()}</span>) × 100
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div id="batch-details-view-container" className="bg-slate-50 h-full w-full flex-1 flex flex-col min-h-0 relative">
      <div className="p-4 pb-0 shrink-0">
        <div className="flex items-center justify-start gap-3 mb-3 pb-2 border-b border-slate-200 overflow-x-auto no-scrollbar max-w-full">
          <div className="flex bg-slate-200/60 p-0.5 rounded border border-slate-200/40 shrink-0 overflow-x-auto no-scrollbar max-w-full">
            {(['info', 'routine', 'workflow', 'documents', 'financial'] as const).map(tab => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    if (tab === 'workflow') {
                      setDocumentFilter(null);
                    }
                  }}
                  className={cn(
                    "relative px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors cursor-pointer select-none focus:outline-none shrink-0 whitespace-nowrap",
                    isActive ? "text-slate-800 font-extrabold" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeBatchTab"
                      className="absolute inset-0 bg-white rounded shadow-2xs"
                      transition={{ type: "spring", stiffness: 380, damping: 28 }}
                    />
                  )}
                  <span className="relative z-10">{tab === 'routine' ? 'class routine' : tab}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-4 pt-0 space-y-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === 'info' && (
              <div className="space-y-5 pt-2">
                {/* Dates / Schedule Box with Schedule label horizontally & vertically centered on top border */}
                <div className="relative border border-slate-200 bg-white rounded-lg p-3.5 pt-4">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-2.5 py-0.5 border border-slate-200 rounded-full flex items-center gap-1.5 text-slate-600 shadow-2xs z-10">
                    <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700 whitespace-nowrap">Schedule</span>
                  </div>

                  {isEditing ? (
                    <div className="grid grid-cols-2 md:grid-cols-12 gap-3 pt-1 text-left">
                      <div className="col-span-1 md:col-span-3">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Start Date</label>
                        <input
                          type="date"
                          value={batch["Start Date"] ? toInputDateValue(batch["Start Date"]) : ''}
                          onChange={(e) => onSaveBatch && onSaveBatch({ ...batch, "Start Date": e.target.value })}
                          className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1.5 focus:border-teal-500 outline-none"
                        />
                      </div>
                      <div className="col-span-1 md:col-span-3">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">End Date</label>
                        <input
                          type="date"
                          value={batch["End Date"] ? toInputDateValue(batch["End Date"]) : ''}
                          onChange={(e) => onSaveBatch && onSaveBatch({ ...batch, "End Date": e.target.value })}
                          className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1.5 focus:border-teal-500 outline-none"
                        />
                      </div>
                      <div className="col-span-1 md:col-span-2">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Course Fee</label>
                        <input
                          type="text"
                          value={batch["Course Fee"] !== undefined ? batch["Course Fee"] : (courseFee || "")}
                          onChange={(e) => onSaveBatch && onSaveBatch({ ...batch, "Course Fee": e.target.value })}
                          className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1.5 focus:border-teal-500 outline-none"
                        />
                      </div>
                      <div className="col-span-1 md:col-span-2">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Discount</label>
                        <input
                          type="text"
                          value={batch["Discount"] !== undefined ? batch["Discount"] : ""}
                          onChange={(e) => onSaveBatch && onSaveBatch({ ...batch, "Discount": e.target.value })}
                          className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1.5 focus:border-teal-500 outline-none"
                        />
                      </div>
                      <div className="col-span-2 md:col-span-2">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Student</label>
                        <input
                          type="number"
                          value={batch["Student"] || ""}
                          onChange={(e) => onSaveBatch && onSaveBatch({ ...batch, "Student": e.target.value })}
                          className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1.5 focus:border-teal-500 outline-none"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-12 divide-y md:divide-y-0 divide-slate-100 text-center gap-y-2.5 md:gap-y-0">
                      <div className="col-span-1 md:col-span-3 px-1">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Start Date</p>
                        <p className="text-xs font-semibold text-slate-800 font-mono">
                          {batch["Start Date"] ? formatToMmmDdYyyy(batch["Start Date"]) : "—"}
                        </p>
                      </div>
                      <div className="col-span-1 md:col-span-3 px-1 md:border-l border-slate-100">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">End Date</p>
                        <p className="text-xs font-semibold text-slate-800 font-mono">
                          {batch["End Date"] ? formatToMmmDdYyyy(batch["End Date"]) : "—"}
                        </p>
                      </div>
                      <div className="col-span-1 md:col-span-2 px-1 pt-2 md:pt-0 border-t md:border-t-0 md:border-l border-slate-100">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Course Fee</p>
                        <p className="text-xs font-bold text-slate-800 font-mono">
                          {batch["Course Fee"] !== undefined && batch["Course Fee"] !== "" ? `৳ ${Number(String(batch["Course Fee"]).replace(/[^0-9.]/g, '')).toLocaleString()}` : (courseFee !== undefined && courseFee !== "" ? `৳ ${Number(String(courseFee).replace(/[^0-9.]/g, '')).toLocaleString()}` : "—")}
                        </p>
                      </div>
                      <div className="col-span-1 md:col-span-2 px-1 pt-2 md:pt-0 border-t md:border-t-0 md:border-l border-slate-100">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Discount</p>
                        <p className="text-xs font-bold text-teal-600 font-mono">
                          {batch["Discount"] ? `৳ ${Number(String(batch["Discount"]).replace(/[^0-9.]/g, '')).toLocaleString()}` : "—"}
                        </p>
                      </div>
                      <div className="col-span-2 md:col-span-2 px-1 pt-2 md:pt-0 border-t md:border-t-0 md:border-l border-slate-100">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Student</p>
                        <p className="text-xs font-bold text-slate-800 font-mono">
                          {batch["Student"] || "0"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Instructors Card with Instructor label horizontally & vertically centered on top border */}
                <div className="relative border border-slate-200 bg-white rounded-lg p-3.5 pt-5">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-2.5 py-0.5 border border-slate-200 rounded-full flex items-center gap-1.5 text-slate-600 shadow-2xs z-10">
                    <Users className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700 whitespace-nowrap">
                      {instructorsToRender.length > 1 ? "Instructors" : "Instructor"}
                    </span>
                  </div>

                  {isEditing && (
                    <div className="mb-3.5 pt-1">
                      <EmployeeMultiSelect
                        label="Select Instructors"
                        selectedIds={instructorIds}
                        onChange={(ids) => {
                          if (onSaveBatch) {
                            onSaveBatch({ ...batch, "Instractor": ids.join(',') });
                          }
                        }}
                        employees={employees || []}
                        placement="right-sidebar"
                      />
                    </div>
                  )}

                  {instructorsToRender.length > 0 ? (
                    <div className="flex items-stretch justify-center gap-3 overflow-x-auto pb-1 pt-1 custom-scrollbar scroll-smooth">
                      {instructorsToRender.map((emp: any, i: number) => (
                        <div 
                           key={i} 
                          className={`flex flex-col items-center justify-center bg-slate-50/70 p-3 rounded-lg border border-slate-200/80 hover:border-teal-300 transition-all text-center ${
                            instructorsToRender.length === 1 ? 'w-full max-w-[180px] mx-auto' : 'min-w-[130px] max-w-[170px] shrink-0'
                          }`}
                        >
                          {/* Top: Photo */}
                          <div className="w-13 h-13 rounded-full bg-white overflow-hidden shrink-0 border-2 border-slate-200 shadow-2xs mb-2">
                            <img 
                              src={getPhotoUrl(emp)} 
                              alt={emp['Employee Name'] || 'Instructor'}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                const currentSrc = target.src;
                                const photoKey = Object.keys(emp).find(k => {
                                  const lk = k.toLowerCase().trim();
                                  return lk.includes("photo") || lk.includes("image") || lk.includes("picture") || lk.includes("avatar") || lk === "img" || lk.includes("profile");
                                });
                                const rawUrl = photoKey ? emp[photoKey] : '';
                                const fileIdMatch = typeof rawUrl === 'string' ? rawUrl.match(/[-\w]{25,}/) : null;

                                if (fileIdMatch && currentSrc.includes('drive.google.com')) {
                                  target.src = `https://lh3.googleusercontent.com/d/${fileIdMatch[0]}=s400`;
                                } else {
                                  target.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(emp['Employee Name'] || 'User') + '&background=0D9488&color=fff';
                                }
                              }}
                            />
                          </div>
                          {/* Middle: Name */}
                          <span className="text-xs font-bold text-slate-800 leading-tight line-clamp-2">
                            {emp['Employee Name'] || 'Unknown'}
                          </span>
                          {/* Bottom: Designation */}
                          <span className="text-[10px] font-medium text-slate-500 mt-1 line-clamp-2">
                            {emp['Designation'] || 'Instructor'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-2">
                      <span className="text-xs italic text-slate-400">No instructor assigned</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'routine' && renderRoutine()}
            {activeTab === 'workflow' && renderWorkflow()}
            {activeTab === 'documents' && renderDocuments()}
            {activeTab === 'financial' && renderFinancial()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
