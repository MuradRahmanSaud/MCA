/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Table from "./components/Table";
import EmployeePanel from "./components/EmployeePanel";
import MCCoursePanel from "./components/MCCoursePanel";
import MCBatchPanel from "./components/MCBatchPanel";
import MCCourseDetails from "./components/MCCourseDetails";
import EmployeePicker from "./components/EmployeePicker";
import SettingsPanel from "./components/SettingsPanel";
import SettingsTab from "./components/SettingsTab";
import MCDashboard from "./components/MCDashboard";
import DocumentsPanel from "./components/DocumentsPanel";
import ExpensesPanel from "./components/ExpensesPanel";
import WorkflowView from "./components/WorkflowView";
import axios from "axios";
import { motion, AnimatePresence } from "motion/react";
import { UserCheck, Eye, LayoutDashboard, BookOpen, Layers, X, Briefcase, FileText, GitMerge, Activity, Users, Coins, CalendarDays } from "lucide-react";
import { useGoogleSheet } from "./hooks/useGoogleSheet";
import { getCourseStatusName } from "./lib/utils";
import ActivityPanel from "./components/ActivityPanel";
import CalendarClassRoutine from "./components/CalendarClassRoutine";

export default function App() {
  const [activeTab, setActiveTab] = useState("micro-credentials");
  const [mcSubTab, setMcSubTab] = useState("dashboard");
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [isCourseDetailsOpen, setIsCourseDetailsOpen] = useState(false);
  const [isCourseDetailsExpanded, setIsCourseDetailsExpanded] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [viewingFile, setViewingFile] = useState<{ url: string; title: string; doc?: any } | null>(null);
  const [docStatus, setDocStatus] = useState<string>("");

  useEffect(() => {
    if (viewingFile?.doc) {
        const tag = String(viewingFile.doc["Tag"] || "");
        if (tag.includes("Revision Required") || tag.includes("Revision")) setDocStatus("Revision");
        else if (tag.includes("Verified") || tag.includes("Job Done") || tag.includes("Approved")) setDocStatus("Verified");
        else setDocStatus("");
    } else {
        setDocStatus("");
    }
  }, [viewingFile]);

  const handleSaveDocStatus = async () => {
    if (!viewingFile || !viewingFile.doc) return;
    
    let tag = String(viewingFile.doc["Tag"] || "");
    // Remove previous status
    tag = tag.replace(/, Revision Required|Revision Required|, Revision|Revision|Verified|, Verified|Job Done|, Job Done|Approved|, Approved/g, "").trim();
    // Add new status
    if (docStatus) {
        tag = tag ? `${tag}, ${docStatus}` : docStatus;
    }
    
    const updatedDoc = { ...viewingFile.doc, Tag: tag };
    
    // Close immediately
    setViewingFile(null);
    
    // Save in background
    handleDocumentSave(updatedDoc, viewingFile.doc).catch(console.error);
  };

  const renderCourseActions = (row: any) => (
    <button 
      onClick={(e) => {
        e.stopPropagation();
        setSelectedCourse(row);
        setIsCourseDetailsExpanded(false);
        setIsCourseDetailsOpen(true);
      }}
      className="p-1 hover:bg-teal-100 rounded text-teal-600"
    >
      <Eye className="w-4 h-4" />
    </button>
  );

  // Helper to read initial setting value from localStorage
  const getSavedSetting = (key: string, fallback: string) => {
    try {
      const saved = localStorage.getItem("settings_data");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const found = parsed.find(r => r.Title === key);
          if (found && found.Content) return found.Content;
        }
      }
    } catch (e) {}
    return fallback;
  };

  const [employeeGid, setEmployeeGid] = useState(() => getSavedSetting("Employee GID", "0"));
  const [settingsGid, setSettingsGid] = useState(() => getSavedSetting("Settings GID", getSavedSetting("GID", "1972051572")));
  const [mcBatchGid, setMcBatchGid] = useState(() => getSavedSetting("MC Batch GID", "1111164355"));
  const [expensesGid, setExpensesGid] = useState(() => getSavedSetting("Expenses GID", "1007542549"));

  // Workforce Sheet (GID = employeeGid)
  const {
    data,
    setData,
    headers,
    isLoading,
    fetchData,
    saveRow: saveEmployee,
    deleteRow: deleteEmployeeRaw
  } = useGoogleSheet({
    gid: employeeGid,
    localStorageKey: "workforce_data",
    fallbackHeaders: [
      "Employee ID", "Employee Name", "Designation", 
      "Mobile", "IP-Ext", "E-mail", 
      "Status", "Group Name", "Department", "Tag"
    ]
  });

  // Settings Sheet (GID = settingsGid)
  const {
    data: settingsData,
    setData: setSettingsData,
    headers: settingsHeaders,
    isLoading: isSettingsLoading,
    fetchData: fetchSettingsData,
    saveRow: saveSettingRaw,
    deleteRow: deleteSetting
  } = useGoogleSheet({
    gid: settingsGid,
    localStorageKey: "settings_data",
    fallbackHeaders: ["Title", "Content"]
  });

  // Course Sheet
  const {
    data: courseData,
    setData: setCourseData,
    headers: courseHeaders,
    isLoading: isCourseLoading,
    fetchData: fetchCourseData,
    saveRow: saveCourse,
    deleteRow: deleteCourseRaw
  } = useGoogleSheet({
    gid: "1120624852",
    localStorageKey: "course_data",
    fallbackHeaders: [
      "Course Code", "Course Title", "Banner", "Mode", "Duration", "Class",
      "Course Fee", "Student Size", "Status", "Workflow",
      "Industry Expert", "Discount",
      "Remarks"
    ]
  });

  // MC Batch Sheet
  const {
    data: mcBatchData,
    setData: setMcBatchData,
    headers: mcBatchHeaders,
    isLoading: isMcBatchLoading,
    fetchData: fetchMcBatchData,
    saveRow: saveMcBatch,
    deleteRow: deleteMcBatchRaw
  } = useGoogleSheet({
    gid: mcBatchGid,
    localStorageKey: "mc_batch_data",
    fallbackHeaders: [
      "Course Code", "Batch Number", "Start Date", "End Date", "Student", "Instractor", "Routine", "Course Fee", "Discount"
    ]
  });

  // Class Routine Slots Sheet (GID = "880522927")
  const {
    data: routineSlotsData,
    setData: setRoutineSlotsData,
    headers: routineSlotsHeaders,
    isLoading: isRoutineSlotsLoading,
    fetchData: fetchRoutineSlotsData,
    saveRow: saveRoutineSlot,
    deleteRow: deleteRoutineSlotRaw
  } = useGoogleSheet({
    gid: "880522927",
    localStorageKey: "routine_slots_data",
    fallbackHeaders: [
      "Slot ID", "Course Code", "Batch Number", "Date", "Start Time", "End Time", "Class Mode", "Room No / Class Link", "Attendance"
    ]
  });

  const enrichedMcBatchData = useMemo(() => {
    if (!mcBatchData || !Array.isArray(mcBatchData)) return [];
    return mcBatchData.map(batch => {
      const courseCode = batch["Course Code"] || batch["courseCode"] || "";
      const batchNo = batch["Batch Number"] || batch["batchNumber"] || "";
      if (!courseCode || !batchNo) return batch;
      
      const slots = routineSlotsData.filter(slot => {
        const slotCourseCode = slot["Course Code"] || slot["courseCode"] || "";
        const slotBatchNo = slot["Batch Number"] || slot["batchNumber"] || "";
        return String(slotCourseCode).trim().toLowerCase() === String(courseCode).trim().toLowerCase() &&
               String(slotBatchNo).trim().toLowerCase() === String(batchNo).trim().toLowerCase();
      });
      
      const routineItems = slots.map((slot, idx) => ({
        id: slot["Slot ID"] || slot["ID"] || slot["id"] || `slot-${idx}-${Date.now()}`,
        date: slot["Date"] || slot["date"] || "",
        startTime: slot["Start Time"] || slot["startTime"] || "",
        endTime: slot["End Time"] || slot["endTime"] || "",
        note: slot["Room No / Class Link"] || slot["roomNoClassLink"] || slot["note"] || "",
        classMode: slot["Class Mode"] || slot["classMode"] || "offline",
        attendanceUrl: slot["Attendance"] || slot["attendance"] || slot["attendanceUrl"] || ""
      }));
      
      const serialized = JSON.stringify(routineItems);
      
      return {
        ...batch,
        "Routine": serialized,
        "Class Routine": serialized
      };
    });
  }, [mcBatchData, routineSlotsData]);

  // Documents Sheet
  const {
    data: documentsData,
    setData: setDocumentsData,
    headers: documentsHeaders,
    isLoading: isDocumentsLoading,
    fetchData: fetchDocumentsData,
    saveRow: saveDocument,
    deleteRow: deleteDocumentRaw
  } = useGoogleSheet({
    gid: "732376789",
    localStorageKey: "documents_data",
    fallbackHeaders: ["Date", "Documents Title", "File Link", "Tag"]
  });

  // Expenses Sheet
  const {
    data: expensesData,
    setData: setExpensesData,
    headers: expensesHeaders,
    isLoading: isExpensesLoading,
    fetchData: fetchExpensesData,
    saveRow: saveExpense,
    deleteRow: deleteExpenseRaw
  } = useGoogleSheet({
    gid: expensesGid,
    localStorageKey: "expenses_data",
    fallbackHeaders: ["Date", "Expenses Title", "Amount", "Voucher", "Tag", "Ref"]
  });

  // Workflow Sheet
  const {
    data: workflowData,
    setData: setWorkflowData,
    headers: workflowHeaders,
    isLoading: isWorkflowLoading,
    fetchData: fetchWorkflowData,
    saveRow: saveWorkflow,
    deleteRow: deleteWorkflow
  } = useGoogleSheet({
    gid: "1686458334",
    localStorageKey: "workflow_data",
    fallbackHeaders: ["Workflow Title"]
  });

  // Keep state GIDs in sync when settingsData updates
  useEffect(() => {
    if (settingsData && Array.isArray(settingsData)) {
      const savedEmployeeGid = settingsData.find(r => r.Title === "Employee GID")?.Content;
      const savedSettingsGid = settingsData.find(r => r.Title === "Settings GID")?.Content || settingsData.find(r => r.Title === "GID")?.Content;
      const savedMCBatchGid = settingsData.find(r => r.Title === "MC Batch GID")?.Content;
      const savedExpensesGid = settingsData.find(r => r.Title === "Expenses GID")?.Content;
      
      if (savedEmployeeGid && savedEmployeeGid !== employeeGid) {
        setEmployeeGid(savedEmployeeGid);
      }
      if (savedSettingsGid && savedSettingsGid !== settingsGid) {
        setSettingsGid(savedSettingsGid);
      }
      if (savedMCBatchGid && savedMCBatchGid !== mcBatchGid) {
        setMcBatchGid(savedMCBatchGid);
      }
      if (savedExpensesGid && savedExpensesGid !== expensesGid) {
        setExpensesGid(savedExpensesGid);
      }
    }
  }, [settingsData, employeeGid, settingsGid, mcBatchGid, expensesGid]);

  const courseTableHeaders = useMemo(() => {
    const hiddenHeaders = [
      "Banner", "Received By", "Gross Revenue", "Net Revenue", "Remarks", 
      "Proposed By", "Developed By", "Reviewed By", "Approved By", "Published By",
      "Workflow", "Expenses", "Net Profit", "Profit %", "Industry Expert", "Industry Expart",
      "Enrolled", "Enrollments", "Expenses", "Batches"
    ];
    // Explicitly filter out "Status", "Batches", "Gross Revenue", "Net Revenue", "Net Profit", "Profit %" and hidden headers to avoid duplicates
    const baseHeaders = courseHeaders.filter(h => 
      !hiddenHeaders.includes(h) && 
      h !== "Status" && 
      h !== "Batches" && 
      h !== "Gross Revenue" && 
      h !== "Net Revenue" && 
      h !== "Net Profit" && 
      h !== "Profit %" &&
      h !== "Enrolled" &&
      h !== "Enrollments" &&
      h !== "Expenses"
    );
    
    // Find Mode index and insert "Status" after it
    const modeIdx = baseHeaders.findIndex(h => h.toLowerCase() === "mode");
    const updatedHeaders = [...baseHeaders];
    
    if (modeIdx !== -1) {
      updatedHeaders.splice(modeIdx + 1, 0, "Status");
    } else {
      // Fallback: Add at the end if Mode column is missing
      updatedHeaders.push("Status");
    }

    return updatedHeaders;
  }, [courseHeaders]);

  const enrichedCourseData = useMemo(() => {
    return courseData.map(course => {
      const fee = parseFloat(String(course["Course Fee"] || "0").replace(/[^0-9.]/g, ""));
      const courseBatches = enrichedMcBatchData.filter(b => 
        String(b['Course Code'] || '').trim().toLowerCase() === String(course['Course Code'] || '').trim().toLowerCase() ||
        String(b['Course Name'] || '').trim().toLowerCase() === String(course['Course Title'] || '').trim().toLowerCase()
      );

      const totalBatchStudents = courseBatches.reduce((sum, b) => {
        const s = parseInt(String(b["Student"] || b["Students"] || "0").replace(/[^0-9.]/g, ""), 10);
        return sum + (isNaN(s) ? 0 : s);
      }, 0);

      const enrolled = parseInt(String(course["Enrolled"] || course["Enrollments"] || totalBatchStudents || "0").replace(/[^0-9.]/g, ""), 10);

      const totalDiscount = courseBatches.reduce((sum, b) => {
        const d = parseFloat(String(b["Discount"] || "0").replace(/[^0-9.]/g, ""));
        return sum + (isNaN(d) ? 0 : d);
      }, 0);

      const discount = totalDiscount;
      const expenses = parseFloat(String(course["Expenses"] || "0").replace(/[^0-9.]/g, ""));
      
      const grossRevenue = isNaN(fee) || isNaN(enrolled) ? 0 : fee * enrolled;
      const netRevenue = grossRevenue - (isNaN(discount) ? 0 : discount);
      const netProfit = netRevenue - (isNaN(expenses) ? 0 : expenses);
      const profitMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;
      
      const courseBatchesCount = courseBatches.length;

      return {
        ...course,
        "Discount": totalDiscount > 0 ? `৳ ${totalDiscount.toLocaleString()}` : '0',
        "Status": getCourseStatusName(course, documentsData, workflowData),
        "Batches": courseBatchesCount.toString(),
        "Gross Revenue": `৳ ${grossRevenue.toLocaleString()}`,
        "Net Revenue": `৳ ${netRevenue.toLocaleString()}`,
        "Net Profit": `৳ ${netProfit.toLocaleString()}`,
        "Profit %": `${profitMargin.toFixed(1)}%`
      };
    });
  }, [courseData, enrichedMcBatchData, documentsData, workflowData]);

  const getDbOverridesHeaders = () => {
    try {
      const saved = localStorage.getItem("settings_data");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const link = parsed.find((r: any) => r.Title === "Google Sheet Link")?.Content || "";
          const api = parsed.find((r: any) => r.Title === "Apps Script API")?.Content || "";
          
          let spreadsheetId = "";
          if (link) {
            const match = link.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (match) {
              spreadsheetId = match[1];
            }
          }
          
          const headers: Record<string, string> = {};
          if (spreadsheetId) headers["x-spreadsheet-id"] = spreadsheetId;
          if (api) headers["x-apps-script-url"] = api;
          return headers;
        }
      }
    } catch (e) {}
    return {};
  };

  const availableEmployeesForPicker = useMemo(() => {
    return data;
  }, [data]);

  const handleSaveMultipleSettings = async (updates: { Title: string; Content: string }[]) => {
    const previousSettings = [...settingsData];
    
    // Optimistically update local settings state
    let updatedSettings = [...settingsData];
    for (const update of updates) {
      const idx = updatedSettings.findIndex(r => r.Title === update.Title);
      if (idx !== -1) {
        updatedSettings[idx] = { ...updatedSettings[idx], ...update };
      } else {
        updatedSettings = [update, ...updatedSettings];
      }
    }
    setSettingsData(updatedSettings);
    localStorage.setItem("settings_data", JSON.stringify(updatedSettings));

    try {
      const headers = getDbOverridesHeaders();
      // Post all updates in parallel to Google Sheet
      await Promise.all(updates.map(async (update) => {
        const exists = previousSettings.some(r => r.Title === update.Title);
        await axios.post("/api/proxy", {
          action: exists ? "UPDATE" : "ADD",
          data: update,
          gid: settingsGid,
          ...(exists && { idKey: "Title", idValue: update.Title })
        }, {
          headers
        });
      }));
    } catch (error) {
      console.warn("Settings proxy sync warning (local settings retained):", error);
    }
  };

  const handleSave = async (formData: any, editingRow: any | null) => {
    const idKey = formData["Employee ID"] ? "Employee ID" : (formData["ID"] ? "ID" : Object.keys(formData)[0]);
    await saveEmployee(formData, editingRow, idKey);
  };

  const handlePickerSave = async (selectedEmployees: any[]) => {
    const idKey = headers.find(h => h.toLowerCase() === "id" || h.toLowerCase() === "employee id") || "Employee ID";
    
    // The picker now returns the COMPLETE list of who SHOULD be MC Representatives
    const selectedIds = new Set(selectedEmployees.map(emp => String(emp[idKey])));
    
    const updatedEmployees: any[] = [];
    const newData = data.map(emp => {
      const id = String(emp[idKey]);
      const shouldHaveTag = selectedIds.has(id);
      
      const currentTagsStr = emp["Tag"] || "";
      let tags: string[] = [];
      if (Array.isArray(currentTagsStr)) {
        tags = [...currentTagsStr];
      } else if (typeof currentTagsStr === 'string') {
        tags = currentTagsStr.split(',').map(s => s.trim()).filter(Boolean);
      }
      
      const hasTag = tags.includes("MC Representatives");
      
      let updatedEmp = null;
      if (shouldHaveTag && !hasTag) {
        // Add tag
        tags.push("MC Representatives");
        updatedEmp = { ...emp, Tag: tags.join(", ") };
      } else if (!shouldHaveTag && hasTag) {
        // Remove tag
        tags = tags.filter(t => t !== "MC Representatives");
        updatedEmp = { ...emp, Tag: tags.join(", ") };
      }
      
      if (updatedEmp) {
        updatedEmployees.push({ id, data: updatedEmp });
        return updatedEmp;
      }
      return emp;
    });

    // Optimistic update locally (all at once)
    setData(newData);

    // Update on server in background (Parallelized)
    Promise.all(updatedEmployees.map(update => 
      axios.post("/api/proxy", {
        action: "UPDATE",
        data: update.data,
        idKey,
        idValue: update.id,
        gid: "0"
      }).catch(error => {
        console.error(`Error updating employee ${update.id}:`, error);
      })
    ));
  };

  const handleDelete = async (row: any) => {
    const rowHeaders = Object.keys(row);
    const idKey = rowHeaders.find(h => {
      const cleaned = h.trim().toLowerCase();
      return cleaned === "id" || cleaned === "employee id" || cleaned === "employee-id" || cleaned === "emp id";
    }) || rowHeaders[0];
    
    const photoKey = rowHeaders.find(h => h.trim().toLowerCase().includes("photo"));
    
    if (!idKey || row[idKey] === undefined) {
      console.warn("Delete failed: No ID found for row", row);
      return;
    }

    try {
      await deleteEmployeeRaw(row, idKey);

      // Try to delete photo (handles both local uploads and Google Drive)
      if (photoKey && row[photoKey]) {
        const photoUrl = row[photoKey];
        if (typeof photoUrl === "string" && photoUrl.trim() !== "") {
          try {
            await axios.post("/api/delete-file", { url: photoUrl });
          } catch (e) {
            console.error("Failed to delete photo:", e);
          }
        }
      }
      
      // We don't call fetchData(true) here immediately because Google Sheet CSV export
      // can be stale for a few seconds. The hook already updated the local state.
    } catch (e: any) {
      alert("Error during deletion: " + e.message);
    }
  };

  const [isSyncing, setIsSyncing] = useState(false);
  const courseTableRef = useRef<any>(null);

  const handleSyncAll = async () => {
    setIsSyncing(true);
    try {
      const gids = [
        employeeGid, 
        settingsGid, 
        "1120624852", 
        mcBatchGid, 
        "880522927", 
        "732376789", 
        expensesGid, 
        "1686458334"
      ];
      const headers = getDbOverridesHeaders();
      const response = await axios.post("/api/sync-all", { gids }, { headers });
      const results = response.data?.results;
      if (results) {
        if (results[employeeGid]) {
          setData(results[employeeGid]);
          localStorage.setItem("workforce_data", JSON.stringify(results[employeeGid]));
        }
        if (results[settingsGid]) {
          setSettingsData(results[settingsGid]);
          localStorage.setItem("settings_data", JSON.stringify(results[settingsGid]));
        }
        if (results["1120624852"]) {
          setCourseData(results["1120624852"]);
          localStorage.setItem("course_data", JSON.stringify(results["1120624852"]));
        }
        if (results[mcBatchGid]) {
          setMcBatchData(results[mcBatchGid]);
          localStorage.setItem("mc_batch_data", JSON.stringify(results[mcBatchGid]));
        }
        if (results["880522927"]) {
          setRoutineSlotsData(results["880522927"]);
          localStorage.setItem("routine_slots_data", JSON.stringify(results["880522927"]));
        }
        if (results["732376789"]) {
          setDocumentsData(results["732376789"]);
          localStorage.setItem("documents_data", JSON.stringify(results["732376789"]));
        }
        if (results[expensesGid]) {
          setExpensesData(results[expensesGid]);
          localStorage.setItem("expenses_data", JSON.stringify(results[expensesGid]));
        }
        if (results["1686458334"]) {
          setWorkflowData(results["1686458334"]);
          localStorage.setItem("workflow_data", JSON.stringify(results["1686458334"]));
        }
      }
    } catch (error) {
      console.error("Sync all failed, falling back to individual fetch:", error);
      await Promise.all([
        fetchData(true),
        fetchSettingsData(true),
        fetchCourseData(true),
        fetchMcBatchData(true),
        fetchDocumentsData(true),
        fetchExpensesData(true),
        fetchWorkflowData(true)
      ]);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSettingsSave = async (formData: any, editingRow: any | null) => {
    await saveSettingRaw(formData, editingRow, "Title");
  };

  const handleSettingsDelete = async (row: any) => {
    await deleteSetting(row, "Title");
  };

  const handleCourseSave = async (formData: any, editingRow: any | null) => {
    // Strip calculated/virtual columns before saving to sheet
    const { 
      "Status": _s, 
      "Gross Revenue": _gr, 
      "Net Revenue": _nr, 
      "Net Profit": _np, 
      "Profit %": _pp,
      ...dataToSave 
    } = formData;

    if (dataToSave["Publication Workflow"] !== undefined) {
      dataToSave["Workflow"] = dataToSave["Publication Workflow"];
    }

    await saveCourse(dataToSave, editingRow, "Course Code");
    setSelectedCourse(formData);
  };

  const handleCourseDelete = async (row: any) => {
    await deleteCourseRaw(row, "Course Code");
  };

  const syncRoutineSlotsForBatch = async (batch: any, rawRoutineString: string) => {
    const courseCode = batch["Course Code"] || batch["courseCode"] || "";
    const batchNo = batch["Batch Number"] || batch["batchNumber"] || "";
    if (!courseCode || !batchNo) return;

    let newSlots: any[] = [];
    try {
      newSlots = typeof rawRoutineString === "string" ? JSON.parse(rawRoutineString) : rawRoutineString;
    } catch (e) {
      console.warn("Could not parse routine slots:", e);
      return;
    }
    if (!Array.isArray(newSlots)) return;

    // Get current slots for this batch from routineSlotsData
    const currentSlots = routineSlotsData.filter(slot => {
      const slotCourseCode = slot["Course Code"] || slot["courseCode"] || "";
      const slotBatchNo = slot["Batch Number"] || slot["batchNumber"] || "";
      return String(slotCourseCode).trim().toLowerCase() === String(courseCode).trim().toLowerCase() &&
             String(slotBatchNo).trim().toLowerCase() === String(batchNo).trim().toLowerCase();
    });

    const currentMap = new Map<string, any>(currentSlots.map(s => [String(s["Slot ID"] || s["ID"] || s["id"]), s]));
    const newMap = new Map<string, any>(newSlots.map(s => [String(s.id), s]));

    // 1. DELETE slots that are not in the new list
    for (const [id, slot] of currentMap.entries()) {
      if (!newMap.has(id)) {
        const slotForDelete = { ...slot, "Slot ID": id };
        let effectiveIdKey = "Slot ID";
        if (!slot["Slot ID"] && slot["ID"]) {
          effectiveIdKey = "ID";
        }
        await deleteRoutineSlotRaw(slotForDelete, effectiveIdKey);
      }
    }

    // 2. ADD or UPDATE slots
    for (const [id, item] of newMap.entries()) {
      const existing = currentMap.get(id);
      const rowData = {
        "Slot ID": id,
        "Course Code": courseCode,
        "Batch Number": batchNo,
        "Date": item.date,
        "Start Time": item.startTime,
        "End Time": item.endTime,
        "Class Mode": item.classMode || "offline",
        "Room No / Class Link": item.note || "",
        "Attendance": item.attendanceUrl || ""
      };

      if (!existing) {
        // ADD new row
        await saveRoutineSlot(rowData, null, "Slot ID");
      } else {
        // Check if any field changed
        const isChanged = 
          existing["Date"] !== item.date ||
          existing["Start Time"] !== item.startTime ||
          existing["End Time"] !== item.endTime ||
          existing["Class Mode"] !== item.classMode ||
          existing["Room No / Class Link"] !== item.note ||
          existing["Attendance"] !== item.attendanceUrl;
          
        if (isChanged) {
          const existingForUpdate = { ...existing, "Slot ID": id };
          let effectiveIdKey = "Slot ID";
          if (!existing["Slot ID"] && existing["ID"]) {
            effectiveIdKey = "ID";
          }
          await saveRoutineSlot(rowData, existingForUpdate, effectiveIdKey);
        }
      }
    }
  };

  const handleMCBatchSave = async (formData: any, editingRow: any | null) => {
    // 1. Sync routine slots to GID 880522927
    const rawRoutine = formData["Routine"] || formData["Class Routine"] || "";
    if (rawRoutine) {
      await syncRoutineSlotsForBatch(formData, rawRoutine);
    }

    // 2. Clear out routine keys before saving to main Batch sheet
    const batchToSave = { ...formData };
    delete batchToSave["Routine"];
    delete batchToSave["Class Routine"];

    const editingRowClean = editingRow ? { ...editingRow } : null;
    if (editingRowClean) {
      delete editingRowClean["Routine"];
      delete editingRowClean["Class Routine"];
    }

    await saveMcBatch(batchToSave, editingRowClean, "Batch Number");
    
    // 3. Force re-fetch of routine slots so local state matches
    await fetchRoutineSlotsData(true);
  };

  const handleMCBatchDelete = async (row: any) => {
    await deleteMcBatchRaw(row, "Batch Number");
  };

  const handleDocumentSave = async (formData: any, editingRow: any | null) => {
    const idKey = documentsHeaders.find(h => {
      const cleaned = h.toLowerCase().trim();
      return cleaned === "documents title" || cleaned === "document title" || cleaned === "title";
    }) || "Documents Title";
    await saveDocument(formData, editingRow, idKey);
  };

  const handleDocumentDelete = async (row: any) => {
    const idKey = documentsHeaders.find(h => {
      const cleaned = h.toLowerCase().trim();
      return cleaned === "documents title" || cleaned === "document title" || cleaned === "title";
    }) || "Documents Title";
    await deleteDocumentRaw(row, idKey);
  };

  const handleExpenseSave = async (formData: any, editingRow: any | null) => {
    const idKey = expensesHeaders.find(h => {
      const cleaned = h.toLowerCase().trim();
      return cleaned === "expenses title" || cleaned === "title" || cleaned === "expense title";
    }) || "Expenses Title";

    const refHeader = expensesHeaders.find(h => {
      const cleaned = h.toLowerCase().trim();
      return cleaned === "ref" || cleaned === "ref name";
    }) || "Ref";

    let finalFormData = { ...formData };
    if (!finalFormData[refHeader]) {
      const tag = String(finalFormData["Tag"] || "").trim();
      if (tag) {
        let courseCode = "";
        let batchNo = "";
        if (tag.includes("-")) {
          const parts = tag.split("-");
          if (parts.length > 1) {
            batchNo = parts[parts.length - 1]?.trim() || "";
            courseCode = parts.slice(0, parts.length - 1).join("-")?.trim() || "";
          } else {
            courseCode = tag;
            batchNo = "01";
          }
        } else {
          courseCode = tag;
          batchNo = "01";
        }

        const targetTag = tag.toLowerCase();
        const sameTagExpenses = expensesData.filter(item => {
          const itemTag = String(item["Tag"] || "").trim().toLowerCase();
          return itemTag === targetTag;
        });

        let maxSerial = 0;
        sameTagExpenses.forEach(item => {
          const refVal = String(item[refHeader] || "");
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
        finalFormData[refHeader] = `${courseCode}/${batchNo}/${nextSerial}`;
      }
    }

    await saveExpense(finalFormData, editingRow, idKey);
  };

  const handleExpenseDelete = async (row: any) => {
    const idKey = expensesHeaders.find(h => {
      const cleaned = h.toLowerCase().trim();
      return cleaned === "expenses title" || cleaned === "title" || cleaned === "expense title";
    }) || "Expenses Title";
    await deleteExpenseRaw(row, idKey);
  };

  const handleWorkflowSave = async (formData: any, editingRow: any | null) => {
    const idKey = workflowHeaders.find(h => {
      const cleaned = h.trim().toLowerCase();
      return cleaned === "workflow title" || cleaned === "title";
    }) || "Workflow Title";
    
    await saveWorkflow(formData, editingRow, idKey);
  };

  const handleWorkflowDelete = async (row: any) => {
    const idKey = workflowHeaders.find(h => {
      const cleaned = h.trim().toLowerCase();
      return cleaned === "workflow title" || cleaned === "title";
    }) || "Workflow Title";
    
    await deleteWorkflow(row, idKey);
  };

  const renderDocumentActions = (row: any) => {
    const fileLink = row["File Link"];
    if (!fileLink) return null;
    
    let viewUrl = fileLink;
    // Transform Google Drive download link to view link
    if (viewUrl.includes("drive.google.com/uc") || viewUrl.includes("export=download")) {
      const fileIdMatch = viewUrl.match(/[?&]id=([^&]+)/);
      if (fileIdMatch && fileIdMatch[1]) {
        viewUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/view`;
      }
    }

    return (
      <div className="flex justify-center">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setViewingFile({ url: viewUrl, title: row["Documents Title"] || "Document Preview" });
          }}
          className="flex items-center gap-1 px-2 py-1 bg-teal-50 hover:bg-teal-100 text-teal-600 rounded border border-teal-200 transition-colors"
          title="View Document"
        >
          <Eye className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold uppercase tracking-wider">View</span>
        </button>
      </div>
    );
  };

  const renderExpenseActions = (row: any) => {
    const voucherLink = row["Voucher"];
    if (!voucherLink) return null;
    
    let viewUrl = voucherLink;
    if (viewUrl.includes("drive.google.com/uc") || viewUrl.includes("export=download")) {
      const fileIdMatch = viewUrl.match(/[?&]id=([^&]+)/);
      if (fileIdMatch && fileIdMatch[1]) {
        viewUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/view`;
      }
    }

    return (
      <div className="flex justify-center">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setViewingFile({ url: viewUrl, title: row["Expenses Title"] || "Voucher Preview" });
          }}
          className="flex items-center gap-1 px-2 py-1 bg-teal-50 hover:bg-teal-100 text-teal-600 rounded border border-teal-200 transition-colors"
          title="View Voucher"
        >
          <Eye className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Voucher</span>
        </button>
      </div>
    );
  };



  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden font-sans antialiased text-gray-800">
      <Header 
        activeTab={activeTab} 
        settingsData={settingsData} 
        onSaveMultipleSettings={handleSaveMultipleSettings} 
        onSyncAll={handleSyncAll}
        isSyncing={isSyncing}
        onLogoClick={() => setIsSidebarOpen(prev => !prev)}
      />
      
      <div className="flex flex-1 overflow-hidden">
        <AnimatePresence initial={false}>
          {isSidebarOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 224, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="h-full overflow-hidden shrink-0"
            >
              <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
            </motion.div>
          )}
        </AnimatePresence>
        
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden border-t border-gray-200">
          <div className="flex-1 overflow-hidden p-3 flex flex-col gap-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.99 }}
                transition={{ duration: 0.15 }}
                className="flex-1 min-h-0"
              >
                {activeTab === "micro-credentials" ? (
                  <div className="flex flex-col w-full h-full bg-white rounded border border-gray-200 overflow-hidden relative">
                    {/* Sub-tabs bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-2.5 bg-gray-50/50 border-b border-gray-100 shrink-0 gap-2">
                      <div className="flex items-center gap-1 bg-gray-200/40 p-1 rounded-lg border border-gray-200/40 max-w-max relative isolate">
                        <button
                          onClick={() => {
                            setMcSubTab("dashboard");
                            setIsCourseDetailsOpen(false);
                          }}
                          className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider cursor-pointer text-gray-500 hover:text-gray-800 transition-colors duration-200 select-none"
                        >
                          {mcSubTab === "dashboard" && (
                            <motion.span
                              layoutId="activeSubTab"
                              className="absolute inset-0 bg-white rounded-md shadow-sm border border-gray-100 -z-10"
                              transition={{ type: "spring", stiffness: 220, damping: 26 }}
                            />
                          )}
                          <LayoutDashboard className="w-3.5 h-3.5" />
                          <span className={mcSubTab === "dashboard" ? "text-teal-800" : ""}>Dashboard</span>
                        </button>
                        <button
                          onClick={() => {
                            setMcSubTab("course");
                            setIsCourseDetailsOpen(false);
                          }}
                          className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider cursor-pointer text-gray-500 hover:text-gray-800 transition-colors duration-200 select-none"
                        >
                          {mcSubTab === "course" && (
                            <motion.span
                              layoutId="activeSubTab"
                              className="absolute inset-0 bg-white rounded-md shadow-sm border border-gray-100 -z-10"
                              transition={{ type: "spring", stiffness: 220, damping: 26 }}
                            />
                          )}
                          <BookOpen className="w-3.5 h-3.5" />
                          <span className={mcSubTab === "course" ? "text-teal-800" : ""}>Course</span>
                        </button>
                        <button
                          onClick={() => {
                            setMcSubTab("batch");
                            setIsCourseDetailsOpen(false);
                          }}
                          className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider cursor-pointer text-gray-500 hover:text-gray-800 transition-colors duration-200 select-none"
                        >
                          {mcSubTab === "batch" && (
                            <motion.span
                              layoutId="activeSubTab"
                              className="absolute inset-0 bg-white rounded-md shadow-sm border border-gray-100 -z-10"
                              transition={{ type: "spring", stiffness: 220, damping: 26 }}
                            />
                          )}
                          <Layers className="w-3.5 h-3.5" />
                          <span className={mcSubTab === "batch" ? "text-teal-800" : ""}>Batch</span>
                        </button>
                        <button
                          onClick={() => {
                            setMcSubTab("class_routine");
                            setIsCourseDetailsOpen(false);
                          }}
                          className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider cursor-pointer text-gray-500 hover:text-gray-800 transition-colors duration-200 select-none"
                        >
                          {mcSubTab === "class_routine" && (
                            <motion.span
                              layoutId="activeSubTab"
                              className="absolute inset-0 bg-white rounded-md shadow-sm border border-gray-100 -z-10"
                              transition={{ type: "spring", stiffness: 220, damping: 26 }}
                            />
                          )}
                          <CalendarDays className="w-3.5 h-3.5" />
                          <span className={mcSubTab === "class_routine" ? "text-teal-800" : ""}>Class Routine</span>
                        </button>
                        <button
                          onClick={() => {
                            setMcSubTab("employees");
                            setIsCourseDetailsOpen(false);
                          }}
                          className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider cursor-pointer text-gray-500 hover:text-gray-800 transition-colors duration-200 select-none"
                        >
                          {mcSubTab === "employees" && (
                            <motion.span
                              layoutId="activeSubTab"
                              className="absolute inset-0 bg-white rounded-md shadow-sm border border-gray-100 -z-10"
                              transition={{ type: "spring", stiffness: 220, damping: 26 }}
                            />
                          )}
                          <Users className="w-3.5 h-3.5" />
                          <span className={mcSubTab === "employees" ? "text-teal-800" : ""}>Employee</span>
                        </button>
                        <button
                          onClick={() => {
                            setMcSubTab("representatives");
                            setIsCourseDetailsOpen(false);
                          }}
                          className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider cursor-pointer text-gray-500 hover:text-gray-800 transition-colors duration-200 select-none"
                        >
                          {mcSubTab === "representatives" && (
                            <motion.span
                              layoutId="activeSubTab"
                              className="absolute inset-0 bg-white rounded-md shadow-sm border border-gray-100 -z-10"
                              transition={{ type: "spring", stiffness: 220, damping: 26 }}
                            />
                          )}
                          <UserCheck className="w-3.5 h-3.5" />
                          <span className={mcSubTab === "representatives" ? "text-teal-800" : ""}>Representatives</span>
                        </button>
                        <button
                          onClick={() => {
                            setMcSubTab("workflow");
                            setIsCourseDetailsOpen(false);
                          }}
                          className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider cursor-pointer text-gray-500 hover:text-gray-800 transition-colors duration-200 select-none"
                        >
                          {mcSubTab === "workflow" && (
                            <motion.span
                              layoutId="activeSubTab"
                              className="absolute inset-0 bg-white rounded-md shadow-sm border border-gray-100 -z-10"
                              transition={{ type: "spring", stiffness: 220, damping: 26 }}
                            />
                          )}
                          <GitMerge className="w-3.5 h-3.5" />
                          <span className={mcSubTab === "workflow" ? "text-teal-800" : ""}>Workflow</span>
                        </button>
                        <button
                          onClick={() => {
                            setMcSubTab("activity");
                            setIsCourseDetailsOpen(false);
                          }}
                          className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider cursor-pointer text-gray-500 hover:text-gray-800 transition-colors duration-200 select-none"
                        >
                          {mcSubTab === "activity" && (
                            <motion.span
                              layoutId="activeSubTab"
                              className="absolute inset-0 bg-white rounded-md shadow-sm border border-gray-100 -z-10"
                              transition={{ type: "spring", stiffness: 220, damping: 26 }}
                            />
                          )}
                          <Activity className="w-3.5 h-3.5" />
                          <span className={mcSubTab === "activity" ? "text-teal-800" : ""}>Activity</span>
                        </button>
                        <button
                          onClick={() => {
                            setMcSubTab("documents");
                            setIsCourseDetailsOpen(false);
                          }}
                          className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider cursor-pointer text-gray-500 hover:text-gray-800 transition-colors duration-200 select-none"
                        >
                          {mcSubTab === "documents" && (
                            <motion.span
                              layoutId="activeSubTab"
                              className="absolute inset-0 bg-white rounded-md shadow-sm border border-gray-100 -z-10"
                              transition={{ type: "spring", stiffness: 220, damping: 26 }}
                            />
                          )}
                          <FileText className="w-3.5 h-3.5" />
                          <span className={mcSubTab === "documents" ? "text-teal-800" : ""}>Documents</span>
                        </button>
                        <button
                          onClick={() => {
                            setMcSubTab("expenses");
                            setIsCourseDetailsOpen(false);
                          }}
                          className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider cursor-pointer text-gray-500 hover:text-gray-800 transition-colors duration-200 select-none"
                        >
                          {mcSubTab === "expenses" && (
                            <motion.span
                              layoutId="activeSubTab"
                              className="absolute inset-0 bg-white rounded-md shadow-sm border border-gray-100 -z-10"
                              transition={{ type: "spring", stiffness: 220, damping: 26 }}
                            />
                          )}
                          <Coins className="w-3.5 h-3.5" />
                          <span className={mcSubTab === "expenses" ? "text-teal-800" : ""}>Expenses</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] font-mono text-gray-400 font-bold tracking-widest uppercase shrink-0">
                        <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                        Micro-Credentials
                      </div>
                    </div>

                    {/* Sub-tab contents */}
                    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={mcSubTab}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15, ease: "easeInOut" }}
                          className="flex-1 overflow-hidden flex flex-col min-h-0 transform-gpu"
                        >
                          {mcSubTab === "dashboard" ? (
                            <MCDashboard 
                              courseData={enrichedCourseData} 
                              mcBatchData={enrichedMcBatchData} 
                              employees={data} 
                              onTabChange={(tab) => {
                                setMcSubTab(tab);
                                setIsCourseDetailsOpen(false);
                              }}
                              onCourseClick={(course) => {
                                setSelectedCourse(course);
                                setMcSubTab("course");
                                setIsCourseDetailsExpanded(false);
                                setTimeout(() => {
                                  setIsCourseDetailsOpen(true);
                                }, 50);
                              }}
                            />
                          ) : mcSubTab === "course" ? (
                            <div className="flex-1 overflow-hidden relative">
                              <Table 
                                ref={courseTableRef}
                                data={enrichedCourseData}
                                headers={courseTableHeaders}
                                formHeaders={courseHeaders.filter(h => !["Proposed By", "Developed By", "Reviewed By", "Approved By", "Published By"].includes(h))}
                                isLoading={isCourseLoading}
                                onSave={handleCourseSave}
                                onDelete={handleCourseDelete}
                                onRefresh={() => fetchCourseData(true)}
                                FormPanel={MCCoursePanel}
                                entityName="Course"
                                title="Course List"
                                renderActions={renderCourseActions}
                                onRowClick={(row) => {
                                  setSelectedCourse(row);
                                  setIsCourseDetailsExpanded(false);
                                  setIsCourseDetailsOpen(true);
                                }}
                                employees={data}
                                extraFormProps={{ 
                                  allBatches: enrichedMcBatchData, 
                                  onSaveBatch: handleMCBatchSave,
                                  allDocuments: documentsData,
                                  onSaveDocument: handleDocumentSave,
                                  workflowData: workflowData,
                                  onExpand: (course: any) => {
                                    setSelectedCourse(course);
                                    setIsCourseDetailsExpanded(true);
                                    setIsCourseDetailsOpen(true);
                                  }
                                }}
                              >
                                <MCCourseDetails 
                                  isOpen={isCourseDetailsOpen}
                                  onClose={() => {
                                    setIsCourseDetailsOpen(false);
                                  }}
                                  data={selectedCourse}
                                  onSave={handleCourseSave}
                                  employees={data}
                                  batches={enrichedMcBatchData}
                                  documents={documentsData}
                                  workflowData={workflowData}
                                  extraFormProps={{
                                    onSaveBatch: handleMCBatchSave,
                                    onSaveDocument: handleDocumentSave,
                                    batchHeaders: mcBatchHeaders,
                                    documentHeaders: documentsHeaders,
                                    expensesData: expensesData,
                                    onSaveExpense: handleExpenseSave,
                                    expensesHeaders: expensesHeaders
                                  }}
                                  initialExpanded={isCourseDetailsExpanded}
                                />
                              </Table>
                            </div>
                          ) : mcSubTab === "batch" ? (
                            <div className="flex-1 overflow-hidden relative">
                              <Table 
                                data={enrichedMcBatchData}
                                headers={mcBatchHeaders}
                                isLoading={isMcBatchLoading}
                                onSave={handleMCBatchSave}
                                onDelete={handleMCBatchDelete}
                                onRefresh={() => fetchMcBatchData(true)}
                                FormPanel={MCBatchPanel}
                                entityName="Batch"
                                title="Batch List"
                                employees={data}
                                extraFormProps={{
                                  workflowData: workflowData
                                }}
                              />
                            </div>
                          ) : mcSubTab === "class_routine" ? (
                            <div className="flex-1 overflow-hidden relative flex flex-col">
                              <CalendarClassRoutine
                                allBatches={enrichedMcBatchData}
                                allCourses={enrichedCourseData}
                                employees={data}
                                onSaveBatch={handleMCBatchSave}
                                 fileLocation={settingsData.find(r => r.Title === "File Location")?.Content || "Main Folder"}
                              />
                            </div>
                          ) : mcSubTab === "employees" ? (
                            <div className="flex-1 overflow-hidden relative">
                              <Table 
                                data={data}
                                headers={headers}
                                isLoading={isLoading}
                                onSave={handleSave}
                                onDelete={handleDelete}
                                onRefresh={() => fetchData(true)}
                                FormPanel={EmployeePanel}
                                entityName="Employee"
                              />
                            </div>
                          ) : mcSubTab === "representatives" ? (
                            <div className="flex-1 overflow-hidden relative">
                              <Table 
                                data={data}
                                headers={headers}
                                isLoading={isLoading}
                                onSave={handleSave}
                                onDelete={handleDelete}
                                onRefresh={() => fetchData(true)}
                                FormPanel={EmployeePanel}
                                entityName="MC Representative"
                                title="Representatives List"
                                initialFilter={{ Tag: "MC Representatives" }}
                                defaultNewValues={{ Tag: ["MC Representatives"] }}
                                onAddClick={() => setShowEmployeePicker(true)}
                              >
                                <EmployeePicker
                                  isOpen={showEmployeePicker}
                                  onClose={() => setShowEmployeePicker(false)}
                                  onSave={handlePickerSave}
                                  employees={availableEmployeesForPicker}
                                  headers={headers}
                                />
                              </Table>
                            </div>
                          ) : mcSubTab === "workflow" ? (
                            <div className="flex-1 overflow-hidden relative">
                              <WorkflowView 
                                data={workflowData}
                                headers={workflowHeaders}
                                isLoading={isWorkflowLoading}
                                onSave={handleWorkflowSave}
                                onDelete={handleWorkflowDelete}
                                onRefresh={() => fetchWorkflowData(true)}
                              />
                            </div>
                          ) : mcSubTab === "activity" ? (
                            <div className="flex-1 overflow-hidden relative">
                              <ActivityPanel
                                courseData={enrichedCourseData}
                                mcBatchData={enrichedMcBatchData}
                                employees={data}
                                workflowData={workflowData}
                                onSaveCourse={handleCourseSave}
                                onSaveBatch={handleMCBatchSave}
                                 fileLocation={settingsData.find(r => r.Title === "File Location")?.Content || "Main Folder"}
                                documents={documentsData}
                                onSaveDocument={handleDocumentSave}
                                onViewFile={(url, title, doc) => setViewingFile({ url, title, doc })}
                              />
                            </div>
                          ) : mcSubTab === "documents" ? (
                            <div className="flex-1 overflow-hidden relative">
                              <Table 
                                data={documentsData}
                                headers={documentsHeaders}
                                isLoading={isDocumentsLoading}
                                onSave={handleDocumentSave}
                                onDelete={handleDocumentDelete}
                                onRefresh={() => fetchDocumentsData(true)}
                                FormPanel={DocumentsPanel}
                                entityName="Document"
                                title="Documents List"
                                renderActions={renderDocumentActions}
                              />
                            </div>
                          ) : mcSubTab === "expenses" ? (
                            <div className="flex-1 overflow-hidden relative">
                              <Table 
                                data={expensesData}
                                headers={expensesHeaders}
                                isLoading={isExpensesLoading}
                                onSave={handleExpenseSave}
                                onDelete={handleExpenseDelete}
                                onRefresh={() => fetchExpensesData(true)}
                                FormPanel={ExpensesPanel}
                                entityName="Expense"
                                title="Expenses List"
                                renderActions={renderExpenseActions}
                              />
                            </div>
                          ) : null}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </div>
                ) : activeTab === "settings" ? (
                  <div className="flex w-full h-full bg-white rounded border border-gray-200 overflow-hidden">
                    <SettingsTab 
                      settingsData={settingsData}
                      isLoading={isSettingsLoading}
                      onSaveMultipleSettings={handleSaveMultipleSettings}
                      onRefresh={() => fetchSettingsData(true)}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full bg-white rounded border border-gray-200">
                    <p className="text-gray-400 text-xs font-mono uppercase tracking-widest">
                      Module Offline / {activeTab}
                    </p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
      <AnimatePresence>
        {viewingFile && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-lg shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between p-3 bg-teal-600 text-white">
                <h3 className="text-sm font-bold truncate pr-4">{viewingFile.title}</h3>
                
                <div className="flex gap-2">
                    <button 
                        onClick={() => setDocStatus("Revision")}
                        className={`px-2 py-1 text-[10px] font-bold rounded ${docStatus === "Revision" || docStatus === "Revision Required" ? "bg-amber-800" : "bg-amber-600 hover:bg-amber-500"}`}
                    >
                        Revision
                    </button>
                    <button 
                        onClick={() => setDocStatus("Verified")}
                        className={`px-2 py-1 text-[10px] font-bold rounded ${docStatus === "Verified" || docStatus === "Job Done" || docStatus === "Approved" ? "bg-emerald-800" : "bg-emerald-600 hover:bg-emerald-500"}`}
                    >
                        Verified
                    </button>
                    <button 
                        onClick={handleSaveDocStatus}
                        className="px-2 py-1 text-[10px] font-bold bg-white text-teal-700 rounded hover:bg-gray-100"
                    >
                        Save
                    </button>
                </div>

                <button 
                  onClick={() => setViewingFile(null)}
                  className="p-1 hover:bg-teal-700 rounded transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 bg-gray-100 relative">
                {viewingFile.url.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/) ? (
                  <div className="w-full h-full flex items-center justify-center p-4 text-center">
                    <img 
                      src={viewingFile.url} 
                      alt={viewingFile.title} 
                      className="max-w-full max-h-full object-contain mx-auto shadow-lg bg-white"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : (
                  <iframe 
                    src={
                      viewingFile.url.includes("drive.google.com") 
                        ? viewingFile.url.replace("/view", "/preview").replace("/edit", "/preview")
                        : viewingFile.url
                    } 
                    className="w-full h-full border-none"
                    title="File Preview"
                  />
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
