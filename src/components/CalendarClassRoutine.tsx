import React, { useState, useMemo, useRef, useEffect } from "react";
import axios from "axios";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Clock,
  Building2,
  Video,
  ExternalLink,
  Edit3,
  Trash2,
  X,
  Check,
  CalendarDays,
  List,
  Grid,
  Loader2,
  ChevronDown,
  Layers,
  BookOpen,
  Users,
  Calendar,
  Eye
} from "lucide-react";
import { formatToMmmDdYyyy, cn, resolveNamesOrIdsToIds } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import ConfirmModal from "./ConfirmModal";

function formatDateWithDay(val: any): string {
  const formattedDate = formatToMmmDdYyyy(val);
  if (!formattedDate) return "";
  
  try {
    const str = String(val).trim();
    const matchYmd = str.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    let d: Date;
    if (matchYmd) {
      const year = parseInt(matchYmd[1], 10);
      const month = parseInt(matchYmd[2], 10) - 1;
      const day = parseInt(matchYmd[3], 10);
      d = new Date(year, month, day);
    } else {
      const timestamp = Date.parse(str);
      if (!isNaN(timestamp)) {
        d = new Date(timestamp);
      } else {
        return formattedDate;
      }
    }
    
    if (d && !isNaN(d.getTime())) {
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dayName = days[d.getDay()];
      return `${formattedDate} (${dayName})`;
    }
  } catch (e) {
    console.error("Error formatting date with day:", e);
  }
  return formattedDate;
}

export interface RoutineItem {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm or 12h
  endTime: string; // HH:mm or 12h
  note?: string; // Room No or Meeting Link
  classMode?: "online" | "offline";
  attendanceUrl?: string; // Link to attendance Google Sheet/file
}

export interface CalendarEvent {
  id: string;
  batchNumber: string;
  batchKey: string;
  courseCode: string;
  courseTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  note: string;
  classMode: "online" | "offline";
  attendanceUrl?: string;
  batchData: any;
  routineItem: RoutineItem;
}

interface CalendarClassRoutineProps {
  allBatches?: any[];
  allCourses?: any[];
  employees?: any[];
  fileLocation?: string;
  onSaveBatch?: (formData: any, editingRow: any | null) => Promise<void>;
}

// Helper to format time for display (e.g., 14:00 -> 02:00 PM)
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

const convertTo24h = (timeStr: string) => {
  if (!timeStr) return "";
  if (!timeStr.toLowerCase().includes("am") && !timeStr.toLowerCase().includes("pm")) return timeStr;
  const [time, ampm] = timeStr.split(" ");
  const [h, m] = time.split(":");
  let hour = parseInt(h, 10);
  if (ampm.toLowerCase() === "pm" && hour < 12) hour += 12;
  if (ampm.toLowerCase() === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${m}`;
};

// Parse routine JSON from batch string
const parseBatchRoutineItems = (rawVal: any): RoutineItem[] => {
  if (!rawVal) return [];
  const str = String(rawVal).trim();
  if (!str) return [];

  if (str.startsWith("[") && str.endsWith("]")) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        return parsed.map((it: any, idx: number) => ({
          id: it.id || `routine-${idx}-${Date.now()}`,
          date: it.date || "",
          startTime: it.startTime || "",
          endTime: it.endTime || "",
          note: it.note || "",
          classMode: it.classMode || (it.note && (it.note.startsWith("http") || it.note.toLowerCase().includes("meet.")) ? "online" : "offline"),
          attendanceUrl: it.attendanceUrl || ""
        }));
      }
    } catch (e) {
      // fallback
    }
  }
  return [];
};

// Calculate class duration in minutes from start and end time string
const getSlotDurationMinutes = (startTimeStr: string, endTimeStr: string): number => {
  if (!startTimeStr || !endTimeStr) return 0;

  const parseTimeToMinutes = (timeStr: string): number | null => {
    let cleaned = timeStr.trim().toLowerCase();
    const isPm = cleaned.includes("pm");
    const isAm = cleaned.includes("am");
    cleaned = cleaned.replace("am", "").replace("pm", "").trim();

    const parts = cleaned.split(":");
    if (parts.length < 2) return null;
    let hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);

    if (isNaN(hours) || isNaN(minutes)) return null;

    if (isPm && hours < 12) hours += 12;
    if (isAm && hours === 12) hours = 0;

    return hours * 60 + minutes;
  };

  const startMins = parseTimeToMinutes(startTimeStr);
  const endMins = parseTimeToMinutes(endTimeStr);

  if (startMins === null || endMins === null) return 0;
  let diff = endMins - startMins;
  if (diff < 0) diff += 24 * 60;
  return diff;
};

// Format total minutes to clean text
const formatMinsToDisplay = (mins: number) => {
  if (mins <= 0) return "0 min";
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (hours > 0 && remainingMins > 0) {
    return `${mins} min (${hours}h ${remainingMins}m)`;
  } else if (hours > 0) {
    return `${mins} min (${hours}h)`;
  } else {
    return `${mins} min`;
  }
};

// Helper to get unique batch key based on Course Code and Batch Number
const getBatchUniqueKey = (b: any) => {
  if (!b) return "";
  const bNo = b["Batch Number"] || b["batchNumber"] || "";
  const cCode = b["Course Code"] || b["courseCode"] || "";
  return `${cCode}___${bNo}`;
};

// Helper to check if Duration and Total HRS do not match by at least 90%
const isDurationMismatch = (courseDurationStr: any, totalMins: number): boolean => {
  if (!courseDurationStr || courseDurationStr === "—") return false;
  const trimmed = String(courseDurationStr).trim();
  const numMatch = trimmed.match(/^\d+(\.\d+)?/);
  if (!numMatch) return false;
  
  const durationHours = parseFloat(numMatch[0]);
  const totalHrs = totalMins / 60;
  
  if (durationHours === 0 && totalHrs === 0) return false;
  if (durationHours === 0 || totalHrs === 0) return true;
  
  const ratio = Math.min(durationHours, totalHrs) / Math.max(durationHours, totalHrs);
  return ratio < 0.9;
};

// Helper to get exact match ratio between duration and total hours (lower is worse match)
const getMatchRatio = (courseDurationStr: any, totalMins: number): number => {
  if (!courseDurationStr || courseDurationStr === "—") return 1.0;
  const trimmed = String(courseDurationStr).trim();
  const numMatch = trimmed.match(/^\d+(\.\d+)?/);
  if (!numMatch) return 1.0;
  
  const durationHours = parseFloat(numMatch[0]);
  const totalHrs = totalMins / 60;
  
  if (durationHours === 0 && totalHrs === 0) return 1.0;
  if (durationHours === 0 || totalHrs === 0) return 0.0;
  
  return Math.min(durationHours, totalHrs) / Math.max(durationHours, totalHrs);
};

export default function CalendarClassRoutine({
  allBatches = [],
  allCourses = [],
  employees = [],
  fileLocation = "Main Folder",
  onSaveBatch
}: CalendarClassRoutineProps) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"month" | "list">("month");
  const [selectedBatchFilter, setSelectedBatchFilter] = useState<string>("ALL");
  const [selectedModeFilter, setSelectedModeFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState<string>("");
  const [selectedDayViewDate, setSelectedDayViewDate] = useState<string>(
    () => new Date().toISOString().split("T")[0]
  );
  const [isEditingDayRoutine, setIsEditingDayRoutine] = useState<boolean>(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState<{ dateStr: string; events: CalendarEvent[] } | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<CalendarEvent | null>(null);

  // Form State
  const [formBatchNumber, setFormBatchNumber] = useState<string>("");
  const [formDate, setFormDate] = useState<string>("");
  const [formStartTime, setFormStartTime] = useState<string>("10:00");
  const [formEndTime, setFormEndTime] = useState<string>("12:00");
  const [formClassMode, setFormClassMode] = useState<"offline" | "online">("offline");
  const [formNote, setFormNote] = useState<string>("");
  const [formAttendanceUrl, setFormAttendanceUrl] = useState<string>("");
  const [isUploadingAttendance, setIsUploadingAttendance] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Custom Dropdown Search States inside Modal
  const [isBatchDropdownOpen, setIsBatchDropdownOpen] = useState<boolean>(false);
  const [batchSearchQuery, setBatchSearchQuery] = useState<string>("");
  const batchDropdownRef = useRef<HTMLDivElement>(null);

  const [isRoomDropdownOpen, setIsRoomDropdownOpen] = useState<boolean>(false);
  const [roomSearchQuery, setRoomSearchQuery] = useState<string>("");
  const roomDropdownRef = useRef<HTMLDivElement>(null);
  const roomTriggerRef = useRef<HTMLDivElement>(null);

  // Separate Month & Year Picker Panel State
  const [isMonthYearPickerOpen, setIsMonthYearPickerOpen] = useState<boolean>(false);
  const [pickerYear, setPickerYear] = useState<number>(() => currentDate.getFullYear());
  const monthYearPickerRef = useRef<HTMLDivElement>(null);

  // Close custom dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (batchDropdownRef.current && !batchDropdownRef.current.contains(e.target as Node)) {
        setIsBatchDropdownOpen(false);
      }
      if (
        roomDropdownRef.current &&
        !roomDropdownRef.current.contains(e.target as Node) &&
        roomTriggerRef.current &&
        !roomTriggerRef.current.contains(e.target as Node)
      ) {
        setIsRoomDropdownOpen(false);
      }
      if (monthYearPickerRef.current && !monthYearPickerRef.current.contains(e.target as Node)) {
        setIsMonthYearPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Extract all calendar events from batches
  const allEvents = useMemo(() => {
    const events: CalendarEvent[] = [];

    if (Array.isArray(allBatches)) {
      allBatches.forEach((batch) => {
        const batchNo = batch["Batch Number"] || batch["batchNumber"] || "Batch-00";
        const courseCode = batch["Course Code"] || "";
        const courseTitle = batch["Course Title"] || "";
        const rawRoutine = batch["Routine"] || batch["routine"] || batch["Class Routine"] || "";
        const batchKey = getBatchUniqueKey(batch);

        const items = parseBatchRoutineItems(rawRoutine);
        items.forEach((item) => {
          if (item.date) {
            events.push({
              id: item.id,
              batchNumber: batchNo,
              batchKey,
              courseCode,
              courseTitle,
              date: item.date,
              startTime: item.startTime,
              endTime: item.endTime,
              note: item.note || "",
              classMode: item.classMode || (item.note && (item.note.startsWith("http") || item.note.toLowerCase().includes("meet.")) ? "online" : "offline"),
              attendanceUrl: item.attendanceUrl || "",
              batchData: batch,
              routineItem: item
            });
          }
        });
      });
    }

    return events;
  }, [allBatches]);

  // Left sidebar batch info calculation
  const sidebarBatchInfoList = useMemo(() => {
    return allBatches.map((b, idx) => {
      const bNo = b["Batch Number"] || b["batchNumber"] || `Batch-${idx + 1}`;
      const courseCode = b["Course Code"] || b["courseCode"] || "";
      const courseTitle = b["Course Title"] || b["courseTitle"] || "";

      // Find matching course from allCourses
      const matchedCourse = allCourses.find((c) => {
        const cCode = c["Course Code"] || c["courseCode"] || "";
        const cTitle = c["Course Title"] || c["courseTitle"] || "";
        if (courseCode && cCode && cCode.toLowerCase() === courseCode.toLowerCase()) return true;
        if (courseTitle && cTitle && cTitle.toLowerCase() === courseTitle.toLowerCase()) return true;
        return false;
      });

      // Required Class from Course list where course code matches, looking up Class Column
      const requiredClass = matchedCourse
        ? (matchedCourse["Class"] || matchedCourse["No. of Class"] || matchedCourse["Total Classes"] || matchedCourse["totalClasses"] || matchedCourse["Total Class"] || matchedCourse["No. of Classes"] || matchedCourse["Classes"] || "—")
        : (b["Class"] || b["No. of Class"] || b["Total Classes"] || b["totalClasses"] || "—");

      // Routine items for this batch
      const rawRoutine = b["Routine"] || b["routine"] || b["Class Routine"] || "";
      const items = parseBatchRoutineItems(rawRoutine);

      // Total routine slots added
      const slotsCount = items.length;

      // Total duration in minutes
      const totalMins = items.reduce((acc, it) => acc + getSlotDurationMinutes(it.startTime, it.endTime), 0);

      const courseDuration = matchedCourse
        ? (matchedCourse["Duration"] || matchedCourse["duration"] || "—")
        : "—";

      const batchClassTime = b["Class Time"] || b["classTime"] || b["Start Time"] || b["startTime"] || "";
      const classTimeRange = batchClassTime
        ? (b["End Time"] ? `${formatTime12h(batchClassTime)} - ${formatTime12h(b["End Time"])}` : formatTime12h(batchClassTime))
        : (items.length > 0
            ? `${formatTime12h(items[0].startTime)} - ${formatTime12h(items[0].endTime)}`
            : "");

      return {
        batchData: b,
        batchNumber: bNo,
        courseCode,
        courseTitle,
        requiredClass,
        slotsCount,
        totalMins,
        formattedMins: formatMinsToDisplay(totalMins),
        courseDuration,
        startDate: b["Start Date"] || b["startDate"] || "",
        endDate: b["End Date"] || b["endDate"] || "",
        classTimeRange,
      };
    }).sort((a, b) => {
      const mismatchA = isDurationMismatch(a.courseDuration, a.totalMins);
      const mismatchB = isDurationMismatch(b.courseDuration, b.totalMins);
      
      if (mismatchA && !mismatchB) return -1;
      if (!mismatchA && mismatchB) return 1;
      if (mismatchA && mismatchB) {
        const ratioA = getMatchRatio(a.courseDuration, a.totalMins);
        const ratioB = getMatchRatio(b.courseDuration, b.totalMins);
        return ratioA - ratioB; // lower match ratio (kom match kora) goes first
      }
      return 0;
    });
  }, [allBatches, allCourses]);

  // Filter sidebar batch list by search query
  const filteredSidebarBatches = useMemo(() => {
    if (!sidebarSearchQuery.trim()) return sidebarBatchInfoList;
    const query = sidebarSearchQuery.toLowerCase().trim();
    return sidebarBatchInfoList.filter(
      (item) =>
        item.batchNumber.toLowerCase().includes(query) ||
        item.courseCode.toLowerCase().includes(query) ||
        item.courseTitle.toLowerCase().includes(query)
    );
  }, [sidebarBatchInfoList, sidebarSearchQuery]);

  // Extract existing room names for dropdown
  const existingRooms = useMemo(() => {
    const rooms = new Set<string>();
    allEvents.forEach((ev) => {
      if (ev.classMode === "offline" && ev.note) {
        const trimmed = ev.note.trim();
        if (trimmed && !trimmed.startsWith("http")) {
          rooms.add(trimmed);
        }
      }
    });
    return Array.from(rooms).sort();
  }, [allEvents]);

  // Filtered Events based on search & filters
  const filteredEvents = useMemo(() => {
    return allEvents.filter((ev) => {
      if (selectedBatchFilter !== "ALL" && ev.batchKey !== selectedBatchFilter) {
        return false;
      }
      if (selectedModeFilter !== "ALL" && ev.classMode !== selectedModeFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchBatch = ev.batchNumber.toLowerCase().includes(term);
        const matchCourse = ev.courseCode.toLowerCase().includes(term) || ev.courseTitle.toLowerCase().includes(term);
        const matchNote = ev.note.toLowerCase().includes(term);
        if (!matchBatch && !matchCourse && !matchNote) return false;
      }
      return true;
    });
  }, [allEvents, selectedBatchFilter, selectedModeFilter, searchTerm]);

  // Calendar Month Calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const calendarCells = useMemo(() => {
    const cells: { dateStr: string; dayNum: number; isCurrentMonth: boolean; isToday: boolean }[] = [];
    const todayStr = new Date().toISOString().split("T")[0];

    // Previous month padding
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const pDay = daysInPrevMonth - i;
      const pDate = new Date(year, month - 1, pDay);
      const dateStr = pDate.toISOString().split("T")[0];
      cells.push({
        dateStr,
        dayNum: pDay,
        isCurrentMonth: false,
        isToday: dateStr === todayStr
      });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const cDate = new Date(year, month, day);
      const yyyy = cDate.getFullYear();
      const mm = String(cDate.getMonth() + 1).padStart(2, "0");
      const dd = String(cDate.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;
      cells.push({
        dateStr,
        dayNum: day,
        isCurrentMonth: true,
        isToday: dateStr === todayStr
      });
    }

    // Next month padding to fill grid
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let day = 1; day <= remaining; day++) {
      const nDate = new Date(year, month + 1, day);
      const yyyy = nDate.getFullYear();
      const mm = String(nDate.getMonth() + 1).padStart(2, "0");
      const dd = String(nDate.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;
      cells.push({
        dateStr,
        dayNum: day,
        isCurrentMonth: false,
        isToday: dateStr === todayStr
      });
    }

    return cells;
  }, [year, month, firstDayOfMonth, daysInMonth, daysInPrevMonth]);

  // Events grouped by date (shows total slots for each date across all batches)
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    allEvents.forEach((ev) => {
      if (ev.date) {
        if (!map[ev.date]) {
          map[ev.date] = [];
        }
        map[ev.date].push(ev);
      }
    });
    Object.keys(map).forEach((d) => {
      map[d].sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
    });
    return map;
  }, [allEvents]);

  // Month Statistics
  const monthStats = useMemo(() => {
    let monthTotal = 0;
    let onlineCount = 0;
    let offlineCount = 0;

    filteredEvents.forEach((ev) => {
      if (ev.date) {
        const evDate = new Date(ev.date);
        if (evDate.getFullYear() === year && evDate.getMonth() === month) {
          monthTotal++;
          if (ev.classMode === "online") onlineCount++;
          else offlineCount++;
        }
      }
    });

    return { monthTotal, onlineCount, offlineCount };
  }, [filteredEvents, year, month]);

  // Routine events for selected day view (defaults to today) - includes all slots for the date regardless of batch filters
  const selectedDayRoutineEvents = useMemo(() => {
    return allEvents
      .filter((ev) => ev.date === selectedDayViewDate)
      .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  }, [allEvents, selectedDayViewDate]);

  // Stats for selected day
  const selectedDayStats = useMemo(() => {
    let totalMins = 0;
    let onlineCount = 0;
    let offlineCount = 0;

    selectedDayRoutineEvents.forEach((ev) => {
      totalMins += getSlotDurationMinutes(ev.startTime, ev.endTime);
      if (ev.classMode === "online") onlineCount++;
      else offlineCount++;
    });

    return {
      total: selectedDayRoutineEvents.length,
      onlineCount,
      offlineCount,
      totalMins,
      formattedHours: formatMinsToDisplay(totalMins),
    };
  }, [selectedDayRoutineEvents]);

  // Navigation handlers
  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const handleToday = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    setCurrentDate(new Date());
    setSelectedDayViewDate(todayStr);
  };

  const handlePrevDay = () => {
    const d = new Date(selectedDayViewDate);
    if (!isNaN(d.getTime())) {
      d.setDate(d.getDate() - 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      setSelectedDayViewDate(`${yyyy}-${mm}-${dd}`);
    }
  };

  const handleNextDay = () => {
    const d = new Date(selectedDayViewDate);
    if (!isNaN(d.getTime())) {
      d.setDate(d.getDate() + 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      setSelectedDayViewDate(`${yyyy}-${mm}-${dd}`);
    }
  };

  // Open modal for adding a routine
  const handleOpenAddModal = (presetDate?: string) => {
    setEditingEvent(null);
    setSaveError(null);
    setFormBatchNumber(selectedBatchFilter !== "ALL" ? selectedBatchFilter : "");
    const today = new Date().toISOString().split("T")[0];
    setFormDate(presetDate || today);
    setFormStartTime("10:00");
    setFormEndTime("12:00");
    setFormClassMode("offline");
    setFormNote("");
    setFormAttendanceUrl("");
    setBatchSearchQuery("");
    setRoomSearchQuery("");
    setIsBatchDropdownOpen(false);
    setIsRoomDropdownOpen(false);
    setIsModalOpen(true);
  };

  // Open modal for editing an existing event
  const handleOpenEditModal = (ev: CalendarEvent, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingEvent(ev);
    setSaveError(null);
    setFormBatchNumber(ev.batchKey);
    setFormDate(ev.date);
    setFormStartTime(convertTo24h(ev.startTime) || "10:00");
    setFormEndTime(convertTo24h(ev.endTime) || "12:00");
    setFormClassMode(ev.classMode || "offline");
    setFormNote(ev.note || "");
    setFormAttendanceUrl(ev.attendanceUrl || "");
    setBatchSearchQuery("");
    setRoomSearchQuery("");
    setIsBatchDropdownOpen(false);
    setIsRoomDropdownOpen(false);
    setIsModalOpen(true);
  };

  const handleAttendanceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!formBatchNumber || !formDate) {
      alert("Please select a batch and enter a class date before uploading attendance.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const batchObj = allBatches.find(
      (b) => getBatchUniqueKey(b) === formBatchNumber || b["Batch Number"] === formBatchNumber || b.id === formBatchNumber || b.ID === formBatchNumber || b["batchNumber"] === formBatchNumber
    );

    if (!batchObj) {
      alert("Selected batch not found.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const cCode = batchObj["Course Code"] || "Course";
    const bNo = batchObj["Batch Number"] || batchObj["batchNumber"] || "Batch";

    const cleanCCode = cCode.trim().replace(/[\/\\]/g, "-");
    const cleanBNo = bNo.trim().replace(/[\/\\]/g, "-");

    const extension = file.name.split('.').pop() || "pdf";
    const customName = `${cCode}-${bNo}-${formDate}.${extension}`;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folderPath", `${fileLocation}/MC Course/${cleanCCode}/${cleanBNo}/Attendance`);
    formData.append("departmentName", customName.replace(/\.[^/.]+$/, ""));

    setIsUploadingAttendance(true);
    setSaveError(null);
    try {
      const response = await axios.post("/api/upload", formData, { timeout: 60000 });
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
        setFormAttendanceUrl(viewUrl);
      } else {
        setSaveError("Upload completed but no URL was returned. Please try again.");
      }
    } catch (error) {
      console.error("Upload failed:", error);
      setSaveError("Failed to upload attendance file. Please try again.");
      alert("Failed to upload attendance file.");
    } finally {
      setIsUploadingAttendance(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Format batch option display: Course Code - Batch-01
  const formatBatchDisplay = (batchObj: any) => {
    if (!batchObj) return "Select Batch";
    const bNo = batchObj["Batch Number"] || batchObj["batchNumber"] || "Batch-00";
    const cCode = batchObj["Course Code"] || "";
    return cCode ? `${cCode} - ${bNo}` : bNo;
  };

  // Filtered batches for modal searchable dropdown
  const filteredBatchOptions = useMemo(() => {
    if (!batchSearchQuery.trim()) return allBatches;
    const query = batchSearchQuery.toLowerCase().trim();
    return allBatches.filter((b) => {
      const bNo = (b["Batch Number"] || b["batchNumber"] || "").toLowerCase();
      const cCode = (b["Course Code"] || "").toLowerCase();
      const cTitle = (b["Course Title"] || "").toLowerCase();
      return bNo.includes(query) || cCode.includes(query) || cTitle.includes(query);
    });
  }, [allBatches, batchSearchQuery]);

  // Filtered rooms for modal searchable dropdown
  const filteredRoomOptions = useMemo(() => {
    if (!roomSearchQuery.trim()) return existingRooms;
    const query = roomSearchQuery.toLowerCase().trim();
    return existingRooms.filter((rm) => rm.toLowerCase().includes(query));
  }, [existingRooms, roomSearchQuery]);

  // Helper to check if form has changed from editingEvent
  const hasChanges = useMemo(() => {
    if (!editingEvent) return true;
    return (
      formBatchNumber !== editingEvent.batchKey ||
      formDate !== editingEvent.date ||
      formStartTime !== (editingEvent.startTime || "10:00") ||
      formEndTime !== (editingEvent.endTime || "12:00") ||
      formClassMode !== (editingEvent.classMode || "offline") ||
      formNote !== (editingEvent.note || "") ||
      formAttendanceUrl !== (editingEvent.attendanceUrl || "")
    );
  }, [editingEvent, formBatchNumber, formDate, formStartTime, formEndTime, formClassMode, formNote, formAttendanceUrl]);

  // Save or Update Routine Slot
  const handleSaveRoutineSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formBatchNumber) {
      setSaveError("Please select a batch.");
      return;
    }
    if (!formDate) {
      setSaveError("Please select a date.");
      return;
    }
    if (!formStartTime) {
      setSaveError("Please select a start time.");
      return;
    }
    if (!formEndTime) {
      setSaveError("Please select an end time.");
      return;
    }
    if (!formNote || !formNote.trim()) {
      if (formClassMode === "online") {
        setSaveError("Google Meet / Class Link is required.");
      } else {
        setSaveError("Room Number is required.");
      }
      return;
    }

    // Retrieve target batch early to validate date range
    const targetBatchForValidation =
      allBatches.find(
        (b) => getBatchUniqueKey(b) === formBatchNumber
      ) || (editingEvent ? editingEvent.batchData : null);

    if (targetBatchForValidation) {
      const bStart = targetBatchForValidation["Start Date"] || targetBatchForValidation["startDate"];
      const bEnd = targetBatchForValidation["End Date"] || targetBatchForValidation["endDate"];
      
      if (!bStart || !bEnd) {
        setSaveError("This batch does not have a Start Date and End Date configured. Please set them first.");
        return;
      }
      
      const dStart = new Date(bStart);
      const dEnd = new Date(bEnd);
      const dInput = new Date(formDate);
      
      dStart.setHours(0, 0, 0, 0);
      dEnd.setHours(23, 59, 59, 999);
      dInput.setHours(12, 0, 0, 0);
      
      if (dInput < dStart || dInput > dEnd) {
        setSaveError(`Date must be between batch's start date (${formatToMmmDdYyyy(bStart)}) and end date (${formatToMmmDdYyyy(bEnd)}).`);
        return;
      }
    }

    const parseTimeToMinutes = (timeStr: string): number => {
      if (!timeStr) return 0;
      const parts = timeStr.split(":");
      if (parts.length < 2) return 0;
      const hours = parseInt(parts[0], 10) || 0;
      const minutes = parseInt(parts[1], 10) || 0;
      return hours * 60 + minutes;
    };

    const startNew = parseTimeToMinutes(formStartTime);
    const endNew = parseTimeToMinutes(formEndTime);

    if (endNew <= startNew) {
      setSaveError("End time must be after start time.");
      return;
    }

    if (formNote && formNote.trim()) {
      const roomLower = formNote.trim().toLowerCase();
      const conflict = allEvents.find((event) => {
        if (editingEvent && event.id === editingEvent.id) return false;
        if (event.date !== formDate) return false;
        if (!event.note || event.note.trim().toLowerCase() !== roomLower) return false;

        const startExisting = parseTimeToMinutes(event.startTime);
        const endExisting = parseTimeToMinutes(event.endTime);
        return startNew < endExisting && startExisting < endNew;
      });

      if (conflict) {
        const batchInfo = conflict.batchNumber ? `(${conflict.courseCode || ""} Batch ${conflict.batchNumber})` : "";
        setSaveError(`Room "${formNote.trim()}" is already booked on this date from ${conflict.startTime} to ${conflict.endTime} ${batchInfo}.`);
        return;
      }
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const isBatchChanged = editingEvent && String(editingEvent.batchKey) !== String(formBatchNumber);
      const savePromises: Promise<void>[] = [];

      if (isBatchChanged) {
        // 1. Remove the routine item with editingEvent.id from the old batch and save it
        const oldBatch = editingEvent.batchData;
        if (oldBatch) {
          const rawRoutineA = oldBatch["Routine"] || oldBatch["routine"] || oldBatch["Class Routine"] || "";
          const itemsA = parseBatchRoutineItems(rawRoutineA);
          const filteredA = itemsA.filter((item) => item.id !== editingEvent.id && !(item.date === editingEvent.date && item.startTime === editingEvent.startTime && item.endTime === editingEvent.endTime));
          const serializedA = JSON.stringify(filteredA);
          const updatedOldBatch = {
            ...oldBatch,
            Routine: serializedA,
            "Class Routine": serializedA
          };
          if (onSaveBatch) {
            savePromises.push(onSaveBatch(updatedOldBatch, oldBatch));
          }
        }
      }

      // Find the target batch to save the slot into (could be the new batch or same batch)
      const targetBatch =
        allBatches.find(
          (b) => getBatchUniqueKey(b) === formBatchNumber
        ) || (editingEvent ? editingEvent.batchData : null);

      if (!targetBatch) {
        throw new Error(`Batch not found.`);
      }

      const batchNo = targetBatch["Batch Number"] || targetBatch["batchNumber"] || "";

      const rawRoutine = targetBatch["Routine"] || targetBatch["routine"] || targetBatch["Class Routine"] || "";
      const currentItems = parseBatchRoutineItems(rawRoutine);

      let updatedItems: RoutineItem[] = [];

      if (editingEvent && !isBatchChanged) {
        // Normal edit: Update the existing item inside currentItems
        let itemUpdated = false;
        updatedItems = currentItems.map((item) => {
          if (!itemUpdated && (item.id === editingEvent.id || (item.date === editingEvent.date && item.startTime === editingEvent.startTime && item.endTime === editingEvent.endTime))) {
            itemUpdated = true;
            return {
              ...item,
              date: formDate,
              startTime: formStartTime,
              endTime: formEndTime,
              classMode: formClassMode,
              note: formNote,
              attendanceUrl: formAttendanceUrl
            };
          }
          return item;
        });
        
        // Just in case it wasn't found (e.g. data corruption)
        if (!itemUpdated) {
          const newItem: RoutineItem = {
            id: editingEvent.id,
            date: formDate,
            startTime: formStartTime,
            endTime: formEndTime,
            classMode: formClassMode,
            note: formNote,
            attendanceUrl: formAttendanceUrl
          };
          updatedItems.push(newItem);
        }
      } else if (editingEvent && isBatchChanged) {
        // Batch was changed: Add the item with same id into the new batch's routine list
        const newItem: RoutineItem = {
          id: editingEvent.id,
          date: formDate,
          startTime: formStartTime,
          endTime: formEndTime,
          classMode: formClassMode,
          note: formNote,
          attendanceUrl: formAttendanceUrl
        };
        updatedItems = [...currentItems, newItem];
      } else {
        // Adding a completely new item
        const newItem: RoutineItem = {
          id: `routine-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          date: formDate,
          startTime: formStartTime,
          endTime: formEndTime,
          classMode: formClassMode,
          note: formNote,
          attendanceUrl: formAttendanceUrl
        };
        updatedItems = [...currentItems, newItem];
      }

      updatedItems.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.startTime || "").localeCompare(b.startTime || "");
      });

      const serialized = JSON.stringify(updatedItems);
      const updatedBatchData = {
        ...targetBatch,
        "Batch Number": batchNo,
        batchNumber: batchNo,
        Routine: serialized,
        "Class Routine": serialized
      };

      const originalRow = {
        ...targetBatch,
        "Batch Number": batchNo,
        batchNumber: batchNo
      };

      if (onSaveBatch) {
        savePromises.push(onSaveBatch(updatedBatchData, originalRow));
      }

      setIsModalOpen(false);
      if (selectedDayEvents) {
        setSelectedDayEvents(null);
      }
      setIsSaving(false);
      
      Promise.all(savePromises).catch(err => {
        console.error("Background sync failed:", err);
      });
    } catch (err: any) {
      console.error("Failed to save routine slot:", err);
      setSaveError(err.message || "Failed to save routine slot.");
      setIsSaving(false);
    }
  };

  // Delete Routine Slot
  const handleDeleteRoutineSlot = (ev: CalendarEvent, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeletingEvent(ev);
  };

  const confirmDeleteRoutineSlot = async () => {
    if (!deletingEvent) return;
    const ev = deletingEvent;
    setDeletingEvent(null);

    try {
      const targetBatch =
        allBatches.find(
          (b) => String(b["Batch Number"] || b["batchNumber"] || "") === String(ev.batchNumber)
        ) || ev.batchData;

      if (!targetBatch) {
        alert("Batch not found for this routine slot.");
        return;
      }

      const batchNo = targetBatch["Batch Number"] || targetBatch["batchNumber"] || ev.batchNumber;

      const rawRoutine = targetBatch["Routine"] || targetBatch["routine"] || targetBatch["Class Routine"] || "";
      const currentItems = parseBatchRoutineItems(rawRoutine);

      const updatedItems = currentItems.filter((item) => item.id !== ev.id && !(item.date === ev.date && item.startTime === ev.startTime && item.endTime === ev.endTime));
      const serialized = JSON.stringify(updatedItems);

      const updatedBatchData = {
        ...targetBatch,
        "Batch Number": batchNo,
        batchNumber: batchNo,
        Routine: serialized,
        "Class Routine": serialized
      };

      const originalRow = {
        ...targetBatch,
        "Batch Number": batchNo,
        batchNumber: batchNo
      };

      if (onSaveBatch) {
        await onSaveBatch(updatedBatchData, originalRow);
      }

      if (selectedDayEvents) {
        const remaining = selectedDayEvents.events.filter((item) => item.id !== ev.id);
        if (remaining.length === 0) setSelectedDayEvents(null);
        else setSelectedDayEvents({ ...selectedDayEvents, events: remaining });
      }
    } catch (err: any) {
      console.error("Failed to delete routine slot:", err);
      alert("Error deleting slot: " + (err.message || "Unknown error"));
    }
  };

  // Current selected batch object for display
  const currentSelectedBatchObj = useMemo(() => {
    return allBatches.find((b) => getBatchUniqueKey(b) === formBatchNumber);
  }, [allBatches, formBatchNumber]);

  // Helper for batch schedule display
  const getBatchScheduleDisplay = (batchObj: any) => {
    if (!batchObj) return "—";
    return batchObj["Schedule"] || batchObj["schedule"] || batchObj["Days"] || batchObj["days"] || batchObj["Time"] || batchObj["time"] || "—";
  };

  // Helper for batch instructor display
  const getBatchInstructorDisplay = (batchObj: any) => {
    if (!batchObj) return "—";
    const instVal = batchObj["Instructor"] || batchObj["Instractor"] || batchObj["instructor"] || "";
    if (!instVal) return "—";
    if (Array.isArray(employees) && employees.length > 0) {
      const resolvedIds = resolveNamesOrIdsToIds(String(instVal), employees);
      const names = resolvedIds.map(idStr => {
        const cleanId = String(idStr).split('|')[0].trim();
        const found = employees.find(e => String(e['Employee ID'] || '').trim() === cleanId || String(e['Employee Name'] || '').trim().toLowerCase() === cleanId.toLowerCase());
        return found ? (found['Employee Name'] || found['name'] || cleanId) : cleanId;
      });
      if (names.length > 0) return names.join(", ");
    }
    return String(instVal);
  };

  const getPhotoUrl = (emp: any) => {
    const photoKey = Object.keys(emp).find(k => {
      const lk = k.toLowerCase().trim();
      return lk.includes("photo") || lk.includes("image") || lk.includes("picture") || lk.includes("avatar") || lk === "img" || lk.includes("profile");
    });
    const rawUrl = photoKey ? emp[photoKey] : '';
    if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
      return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(emp['Employee Name'] || emp['name'] || 'User') + '&background=0D9488&color=fff';
    }
    const fileIdMatch = rawUrl.match(/[-\w]{25,}/);
    if (fileIdMatch && rawUrl.includes('drive.google.com')) {
      return `https://drive.google.com/thumbnail?id=${fileIdMatch[0]}&sz=w200`;
    }
    return rawUrl;
  };

  const getBatchInstructorList = (batchObj: any) => {
    if (!batchObj) return [];
    const instructorVal = batchObj["Instructor"] || batchObj["Instractor"] || batchObj["instructor"] || "";
    if (!instructorVal || String(instructorVal).trim() === "") return [];

    const empList = employees || [];
    const instructorIds = resolveNamesOrIdsToIds(String(instructorVal), empList);
    
    const resolvedFromIds = instructorIds.map(rawId => {
      const cleanId = String(rawId).split('|')[0].trim();
      return empList.find(e => {
        const empId = String(e['Employee ID'] || '').trim();
        const empName = String(e['Employee Name'] || e['name'] || '').trim();
        return (
          empId === cleanId || 
          empName.toLowerCase() === cleanId.toLowerCase()
        );
      });
    }).filter(Boolean);

    if (resolvedFromIds.length > 0) return resolvedFromIds;

    const items = String(instructorVal).split(/[,;]/).map(s => s.trim()).filter(Boolean);
    return items.map(item => {
      const parts = item.split('|').map(p => p.trim());
      const firstPart = parts[0] || '';
      const secondPart = parts[1] || '';

      const found = empList.find(e => {
        const empId = String(e['Employee ID'] || '').trim().toLowerCase();
        const empName = String(e['Employee Name'] || e['name'] || '').trim().toLowerCase();
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

  // Routine items for the selected batch
  const selectedBatchRoutineItems = useMemo(() => {
    if (!currentSelectedBatchObj) return [];
    const rawRoutine = currentSelectedBatchObj["Routine"] || currentSelectedBatchObj["routine"] || currentSelectedBatchObj["Class Routine"] || "";
    return parseBatchRoutineItems(rawRoutine);
  }, [currentSelectedBatchObj]);

  // Match Course Code with allCourses Course list to get Course Title
  const selectedCourseTitle = useMemo(() => {
    if (!currentSelectedBatchObj) return "";
    const code = String(currentSelectedBatchObj["Course Code"] || "").trim().toLowerCase();
    if (!code) return currentSelectedBatchObj["Course Title"] || "";
    if (Array.isArray(allCourses)) {
      const found = allCourses.find(c => String(c["Course Code"] || "").trim().toLowerCase() === code);
      if (found) return found["Course Title"] || found["title"] || found["Course Name"] || currentSelectedBatchObj["Course Title"] || "";
    }
    return currentSelectedBatchObj["Course Title"] || "";
  }, [currentSelectedBatchObj, allCourses]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/60 overflow-hidden">
      {/* Top Header & Toolbar */}
      <div className="bg-white border-b border-slate-200/80 px-3.5 py-1.5 shrink-0">
        {/* Row 1: Controls & Centered Title */}
        <div className="flex items-center justify-between gap-3">
          {/* Left: Calendar Icon & Month Navigation */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="p-1.5 rounded-lg bg-teal-50 border border-teal-100 text-teal-700 shadow-2xs">
              <CalendarDays className="w-4 h-4 text-teal-600" />
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative" ref={monthYearPickerRef}>
                <button
                  type="button"
                  onClick={() => {
                    setPickerYear(year);
                    setIsMonthYearPickerOpen((prev) => !prev);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200/80 border border-slate-200/80 font-bold text-slate-800 text-xs tracking-tight transition-all cursor-pointer shadow-2xs group"
                  title="Click to change Month & Year"
                >
                  <span>{monthNames[month]} {year}</span>
                  <ChevronDown className={cn("w-3.5 h-3.5 text-slate-500 group-hover:text-slate-800 transition-transform duration-200", isMonthYearPickerOpen && "rotate-180")} />
                </button>

                <AnimatePresence>
                  {isMonthYearPickerOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50"
                    >
                      {/* Header: Year Selector */}
                      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                        <button
                          type="button"
                          onClick={() => setPickerYear((prev) => prev - 1)}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                          title="Previous Year"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={pickerYear}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              if (!isNaN(val)) setPickerYear(val);
                            }}
                            className="w-20 text-center font-bold text-base text-slate-800 bg-slate-50 border border-slate-200 rounded-lg py-1 px-1 focus:bg-white focus:border-teal-500 outline-none"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => setPickerYear((prev) => prev + 1)}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                          title="Next Year"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Month 3x4 Grid */}
                      <div className="grid grid-cols-3 gap-1.5">
                        {monthNames.map((mName, mIdx) => {
                          const isSelected = mIdx === month && pickerYear === year;
                          return (
                            <button
                              key={mIdx}
                              type="button"
                              onClick={() => {
                                setCurrentDate(new Date(pickerYear, mIdx, 1));
                                setIsMonthYearPickerOpen(false);
                              }}
                              className={cn(
                                "py-2 px-1 text-xs font-bold rounded-lg transition-all cursor-pointer text-center",
                                isSelected
                                  ? "bg-teal-600 text-white shadow-xs"
                                  : "bg-slate-50 text-slate-700 hover:bg-teal-50 hover:text-teal-700 border border-slate-100"
                              )}
                            >
                              {mName.substring(0, 3)}
                            </button>
                          );
                        })}
                      </div>

                      {/* Quick Actions Footer */}
                      <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => {
                            const today = new Date();
                            setCurrentDate(today);
                            setPickerYear(today.getFullYear());
                            setIsMonthYearPickerOpen(false);
                          }}
                          className="text-teal-600 hover:text-teal-700 hover:underline cursor-pointer"
                        >
                          Current Month
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsMonthYearPickerOpen(false)}
                          className="text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          Close
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 ml-1">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 hover:bg-white rounded-md text-slate-600 hover:text-slate-900 transition-all cursor-pointer shadow-2xs"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleToday}
                  className="px-2 py-0.5 text-xs font-bold text-slate-700 hover:bg-white rounded-md transition-all cursor-pointer shadow-2xs"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1 hover:bg-white rounded-md text-slate-600 hover:text-slate-900 transition-all cursor-pointer shadow-2xs"
                  title="Next Month"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Middle: Centered Title */}
          <div className="flex-1 text-center min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-slate-700 tracking-tight truncate">
              Class Routine Schedule & Calendar View
            </h2>
          </div>

          {/* Right: Balance spacer */}
          <div className="hidden lg:block shrink-0 w-8" />
        </div>
      </div>

      {/* Main Container: Left Batches List + Calendar Grid + Day Routine */}
      <div className="flex-1 overflow-auto p-4 bg-slate-50/60 min-h-0">
        <div className="flex flex-col lg:flex-row gap-4 h-full min-h-[580px]">
          {/* LEFT SIDEBAR: ALL BATCHES OVERVIEW CARD (MATCHING DAY ROUTINE HEIGHT & STYLING) */}
          <aside className="w-full lg:w-64 xl:w-72 2xl:w-80 bg-white rounded-xl border border-slate-200/80 shadow-xs flex flex-col h-full shrink-0 min-h-[580px] overflow-hidden">
            {/* Sidebar Header & Search */}
            <div className="p-3.5 bg-slate-50/90 border-b border-slate-200/80 flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 rounded-lg bg-teal-100/90 text-teal-700 shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-extrabold text-slate-800 tracking-tight truncate">
                      Batches List
                    </h3>
                    <p className="text-[10px] text-slate-500 font-bold">
                      {allBatches.length} total batches
                    </p>
                  </div>
                </div>

                {selectedBatchFilter !== "ALL" && (
                  <button
                    type="button"
                    onClick={() => setSelectedBatchFilter("ALL")}
                    className="px-2 py-0.5 text-[10px] font-extrabold bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200/80 rounded-md transition-colors cursor-pointer shrink-0"
                  >
                    Show All
                  </button>
                )}
              </div>

              {/* Search Input for Batches */}
              <div className="relative flex items-center pt-0.5">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search batch or course..."
                  value={sidebarSearchQuery}
                  onChange={(e) => setSidebarSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200/80 rounded-lg text-slate-800 placeholder:text-slate-400 focus:border-teal-500 outline-none font-medium shadow-2xs transition-all"
                />
                {sidebarSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setSidebarSearchQuery("")}
                    className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Batches Overview Cards List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
              {filteredSidebarBatches.length === 0 ? (
                <div className="p-6 text-center text-slate-400 space-y-1">
                  <Search className="w-5 h-5 mx-auto text-slate-300" />
                  <p className="text-xs font-semibold">No batch found</p>
                </div>
              ) : (
                filteredSidebarBatches.map((item, idx) => {
                  const itemKey = `${item.courseCode}___${item.batchNumber}`;
                  const isSelected = selectedBatchFilter === itemKey;
                  const hasMismatch = isDurationMismatch(item.courseDuration, item.totalMins);
                  const instructors = getBatchInstructorList(item.batchData);
                  const studentCount = item.batchData["Student"] || item.batchData["Students"] || item.batchData["Student Size"] || item.batchData["student"] || "—";
                  
                  return (
                    <div
                      key={`${itemKey}-${idx}`}
                      onClick={() =>
                        setSelectedBatchFilter(isSelected ? "ALL" : itemKey)
                      }
                      className={cn(
                        "p-2.5 rounded-xl border transition-all cursor-pointer space-y-2",
                        isSelected
                          ? "bg-teal-50/70 border-teal-500 ring-2 ring-teal-500/20 shadow-xs"
                          : "bg-white border-slate-200/90 hover:border-teal-300 hover:bg-slate-50/80 shadow-2xs"
                      )}
                    >
                      {/* Instructor Info & Slot Count Badge at the very top */}
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                        {instructors.length > 0 ? (
                          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                            {instructors.map((inst: any, iIdx: number) => {
                              const name = inst['Employee Name'] || inst['name'] || 'Instructor';
                              const designation = inst['Designation'] || inst['designation'] || 'Instructor';
                              const photoUrl = getPhotoUrl(inst);
                              return (
                                <div key={iIdx} className="flex items-center gap-2">
                                  <img
                                    src={photoUrl}
                                    alt={name}
                                    referrerPolicy="no-referrer"
                                    className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=0D9488&color=fff';
                                    }}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <h5 className="text-[11px] font-bold text-slate-900 truncate leading-tight">
                                      {name}
                                    </h5>
                                    <p className="text-[9.5px] font-medium text-slate-500 truncate leading-tight">
                                      {designation}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-[11px] font-medium text-slate-400 italic">No instructor</div>
                        )}

                        {/* Slot count badge */}
                        <div className="flex items-center gap-1 shrink-0 px-2 py-0.5 bg-teal-50 text-teal-700 rounded-md text-[10px] font-extrabold border border-teal-200/80" title={`${item.slotsCount} Slots Scheduled`}>
                          <Clock className="w-3 h-3 text-teal-600 shrink-0" />
                          <span>{item.slotsCount}</span>
                        </div>
                      </div>

                      {/* Header: Course Code (Left) & Batch No (Right corner) */}
                      <div className="flex items-center justify-between gap-2">
                        {item.courseCode ? (
                          <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100 max-w-[70%] truncate">
                            {item.courseCode}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                            No Code
                          </span>
                        )}
                        <span className="font-mono text-[10px] font-extrabold text-slate-800 bg-slate-100/90 px-1.5 py-0.5 rounded border border-slate-200/80 shrink-0">
                          {item.batchNumber}
                        </span>
                      </div>

                      {/* Course Title if available */}
                      {item.courseTitle && (
                        <p className="text-[11px] font-semibold text-slate-600 truncate mt-1">
                          {item.courseTitle}
                        </p>
                      )}

                      {/* Batch Start Date and End Date - Centered */}
                      {(item.startDate || item.endDate) && (
                        <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-600 font-bold py-1 bg-slate-50/70 border border-slate-100/60 rounded-lg text-center w-full">
                          <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span>
                            {item.startDate ? formatToMmmDdYyyy(item.startDate) : "—"} to {item.endDate ? formatToMmmDdYyyy(item.endDate) : "—"}
                          </span>
                        </div>
                      )}

                      {/* Bottom Row: 3 metrics inline */}
                      <div className="grid grid-cols-3 gap-1 pt-2 border-t border-slate-100 text-[10px]">
                        {/* Student Count */}
                        <div className="flex flex-col items-center justify-center bg-slate-50 border border-slate-100 rounded p-1 text-center">
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Student</span>
                          <span className="font-extrabold text-teal-700 truncate max-w-full">{studentCount}</span>
                        </div>

                        {/* Course Duration */}
                        <div className="flex flex-col items-center justify-center bg-slate-50 border border-slate-100 rounded p-1 text-center">
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Duration</span>
                          <span className={cn("font-extrabold truncate max-w-full", hasMismatch ? "text-rose-600 font-black" : "text-teal-700")} title={item.courseDuration}>
                            {(() => {
                              if (!item.courseDuration || item.courseDuration === "—") return "—";
                              const trimmed = String(item.courseDuration).trim();
                              if (/^\d+(\.\d+)?$/.test(trimmed)) {
                                return `${trimmed} hrs`;
                              }
                              if (/^\d+(\.\d+)?\s*(days|day|hrs|hr|hours|hour)$/i.test(trimmed)) {
                                const num = trimmed.match(/^\d+(\.\d+)?/)?.[0];
                                return `${num} hrs`;
                              }
                              return trimmed;
                            })()}
                          </span>
                        </div>

                        {/* Total Hours Added */}
                        <div className="flex flex-col items-center justify-center bg-slate-50 border border-slate-100 rounded p-1 text-center">
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Total Hrs</span>
                          <span className={cn("font-extrabold", hasMismatch ? "text-rose-600 font-black" : "text-indigo-700")}>
                            {(() => {
                              const hours = (item.totalMins / 60).toFixed(1).replace(/\.0$/, "");
                              return `${hours} hrs`;
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* RIGHT / CENTER MAIN CALENDAR AREA */}
          <div className="flex-1 flex flex-col xl:flex-row gap-4 h-full min-h-[580px] min-w-0">
            {/* LEFT: MONTH CALENDAR GRID */}
            <div className="flex-1 bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col h-full min-h-[580px]">
              {/* Days Header */}
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 text-center font-bold text-[11px] uppercase tracking-wider text-slate-600 py-2.5 shrink-0">
                <div className="text-rose-600">Sun</div>
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div className="text-teal-700">Sat</div>
              </div>

              {/* Grid Cells */}
              <div className="grid grid-cols-7 flex-1 auto-rows-fr border-b border-slate-200/80 divide-x divide-y divide-slate-100">
                {calendarCells.map((cell, idx) => {
                  const dayEvents = eventsByDate[cell.dateStr] || [];
                  const isSun = idx % 7 === 0;
                  const isSelectedDay = cell.dateStr === selectedDayViewDate;

                  // Selected batch slot matching for highlight
                  const selectedBatchEventsOnDay = selectedBatchFilter !== "ALL"
                    ? dayEvents.filter((ev) => ev.batchKey === selectedBatchFilter)
                    : [];
                  const hasSelectedBatchSlot = selectedBatchEventsOnDay.length > 0;

                  return (
                    <div
                      key={cell.dateStr + "-" + idx}
                      onClick={() => setSelectedDayViewDate(cell.dateStr)}
                      onDoubleClick={() => handleOpenAddModal(cell.dateStr)}
                      className={cn(
                        "group relative p-1.5 min-h-[90px] sm:min-h-[105px] flex flex-col transition-all cursor-pointer hover:bg-slate-50/80",
                        !cell.isCurrentMonth ? "bg-slate-50/40 text-slate-300" : "bg-white text-slate-700",
                        cell.isToday ? "bg-teal-50/20" : "",
                        isSelectedDay ? "!bg-teal-100/80 text-slate-900 font-medium z-10" : "",
                        hasSelectedBatchSlot ? "!bg-amber-50/80" : ""
                      )}
                    >
                      {/* Top Cell Bar: Date Number */}
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={cn(
                            "inline-flex items-center justify-center text-xs font-bold w-6 h-6 rounded-full transition-all",
                            cell.isToday
                              ? "bg-teal-600 text-white shadow-2xs"
                              : isSelectedDay
                              ? "bg-teal-700 text-white font-extrabold shadow-2xs"
                              : cell.isCurrentMonth
                              ? isSun
                                ? "text-rose-600"
                                : "text-slate-700"
                              : "text-slate-300"
                          )}
                        >
                          {cell.dayNum}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenAddModal(cell.dateStr);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-teal-100 text-teal-700 rounded transition-all cursor-pointer"
                          title="Add routine for this date"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Class Count Text for Day Cell */}
                      {dayEvents.length > 0 && (
                        <div className="flex-1 flex items-center justify-center p-1 my-auto">
                          <div
                            className={cn(
                              "font-bold text-xs flex items-center gap-1.5 transition-colors",
                              isSelectedDay
                                ? "text-teal-900 font-extrabold"
                                : hasSelectedBatchSlot
                                ? "text-amber-900 font-extrabold"
                                : cell.isCurrentMonth
                                ? "text-teal-700"
                                : "text-slate-400"
                            )}
                          >
                            <Clock className="w-3.5 h-3.5 shrink-0 opacity-80" />
                            <span>
                              {dayEvents.length} {dayEvents.length === 1 ? "Class" : "Classes"}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT: DAY-WISE CLASS ROUTINE PANEL */}
            <div className="w-full xl:w-80 2xl:w-96 bg-white rounded-xl border border-slate-200/80 shadow-xs flex flex-col h-full shrink-0 min-h-[580px] overflow-hidden">
              {/* Panel Header */}
              <div className="p-3.5 bg-slate-50/90 border-b border-slate-200/80 flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 rounded-lg bg-teal-100/90 text-teal-700 shrink-0">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="text-xs font-extrabold text-slate-800 tracking-tight truncate">
                          {selectedDayViewDate === new Date().toISOString().split("T")[0]
                            ? "Today's Routine"
                            : "Day Routine"}
                        </h3>
                        {selectedDayViewDate === new Date().toISOString().split("T")[0] && (
                          <span className="px-1.5 py-0.2 bg-teal-600 text-white rounded text-[9px] font-bold uppercase tracking-wider">
                            Today
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-bold text-slate-600 truncate">
                        {formatDateWithDay(selectedDayViewDate)}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsEditingDayRoutine(!isEditingDayRoutine)}
                    className={cn(
                      "p-1.5 rounded-lg transition-all shadow-2xs cursor-pointer shrink-0 flex items-center gap-1 text-[11px] font-bold",
                      isEditingDayRoutine
                        ? "bg-amber-500 hover:bg-amber-600 text-white ring-2 ring-amber-300"
                        : "bg-teal-600 hover:bg-teal-700 text-white"
                    )}
                    title={isEditingDayRoutine ? "Done Editing" : "Edit Day Routine"}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{isEditingDayRoutine ? "Done" : "Edit"}</span>
                  </button>
                </div>

                {/* Date Navigation & Actions */}
                <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-slate-200/60">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handlePrevDay}
                      className="p-1 hover:bg-slate-200/70 rounded text-slate-600 transition-colors cursor-pointer"
                      title="Previous Day"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDayViewDate(new Date().toISOString().split("T")[0])}
                      className="px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200/70 rounded transition-colors cursor-pointer bg-slate-100"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={handleNextDay}
                      className="p-1 hover:bg-slate-200/70 rounded text-slate-600 transition-colors cursor-pointer"
                      title="Next Day"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                    <span className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200/60">
                      {selectedDayStats.total} {selectedDayStats.total === 1 ? "Class" : "Classes"}
                    </span>
                    {selectedDayStats.totalMins > 0 && (
                      <span className="px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded border border-teal-200/60">
                        {selectedDayStats.formattedHours}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Class Items List for Selected Day */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                {selectedDayRoutineEvents.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2 text-slate-400">
                    <div className="p-3 bg-slate-50 rounded-full border border-slate-100">
                      <CalendarIcon className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-xs font-bold text-slate-600">No classes scheduled</p>
                    <p className="text-[11px] text-slate-400 max-w-[200px]">
                      There are no routine slots for {formatToMmmDdYyyy(selectedDayViewDate)}.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleOpenAddModal(selectedDayViewDate)}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Routine Slot</span>
                    </button>
                  </div>
                ) : (
                  selectedDayRoutineEvents.map((ev) => {
                    const isOnline = ev.classMode === "online";
                    const durationMins = getSlotDurationMinutes(ev.startTime, ev.endTime);
                    const instructors = getBatchInstructorList(ev.batchData);

                    return (
                      <div
                        key={ev.id}
                        className="p-3 rounded-xl border border-slate-200/90 bg-white hover:border-teal-300 hover:bg-slate-50/80 shadow-2xs transition-all space-y-2.5"
                      >
                        {/* Instructor Info at the very top */}
                        {instructors.length > 0 && (
                          <div className="flex flex-col gap-1.5 pb-2 border-b border-slate-100">
                            {instructors.map((inst: any, idx: number) => {
                              const name = inst['Employee Name'] || inst['name'] || 'Instructor';
                              const designation = inst['Designation'] || inst['designation'] || 'Instructor';
                              const photoUrl = getPhotoUrl(inst);
                              return (
                                <div key={idx} className="flex items-center gap-2">
                                  <img
                                    src={photoUrl}
                                    alt={name}
                                    referrerPolicy="no-referrer"
                                    className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=0D9488&color=fff';
                                    }}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <h5 className="text-[11px] font-bold text-slate-900 truncate leading-tight">
                                      {name}
                                    </h5>
                                    <p className="text-[9.5px] font-medium text-slate-500 truncate leading-tight">
                                      {designation}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* 1. Top Row: Left = Course Code, Right = Batch */}
                        <div className="flex items-center justify-between gap-2">
                          {ev.courseCode ? (
                            <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-100 max-w-[60%] truncate">
                              {ev.courseCode}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                              No Code
                            </span>
                          )}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-mono text-[10px] font-extrabold text-slate-800 bg-slate-100/90 px-2 py-0.5 rounded border border-slate-200/80">
                              {ev.batchNumber}
                            </span>
                            {/* Actions: Edit (Shown when Edit mode is toggled) */}
                            {isEditingDayRoutine && (
                              <button
                                type="button"
                                onClick={(e) => handleOpenEditModal(ev, e)}
                                className="p-1 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200/80 rounded transition-colors cursor-pointer"
                                title="Edit Routine"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Course Title if available */}
                        {ev.courseTitle && (
                          <p className="text-[11px] font-semibold text-slate-600 truncate">
                            {ev.courseTitle}
                          </p>
                        )}

                        {/* 2. Second Row: Time */}
                        <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-800">
                          <Clock className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                          <span>
                            {formatTime12h(ev.startTime)} - {formatTime12h(ev.endTime)}
                          </span>
                        </div>

                        {/* 3. Bottom Row: 3 metric columns (Room, Attendance, Hour) */}
                        <div className="grid grid-cols-3 gap-1 pt-2 border-t border-slate-100 text-[10px]">
                          {/* Room */}
                          <div className="flex flex-col items-center justify-center bg-slate-50 border border-slate-100 rounded p-1 text-center">
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Room</span>
                            <span className="font-extrabold text-slate-700 truncate max-w-full" title={isOnline ? "Online" : (ev.note || "N/A")}>
                              {isOnline ? "Online" : (ev.note || "N/A")}
                            </span>
                          </div>

                          {/* Attendance */}
                          <div className="flex flex-col items-center justify-center bg-slate-50 border border-slate-100 rounded p-1 text-center">
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Attendance</span>
                            {ev.attendanceUrl ? (
                              <a
                                href={ev.attendanceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-extrabold text-teal-600 hover:underline inline-flex items-center gap-0.5 truncate max-w-full"
                                title="View Attendance"
                              >
                                <Eye className="w-2.5 h-2.5 shrink-0" />
                                <span>View</span>
                              </a>
                            ) : (
                              <span className="font-extrabold text-amber-600 truncate max-w-full">Pending</span>
                            )}
                          </div>

                          {/* Hour */}
                          <div className="flex flex-col items-center justify-center bg-slate-50 border border-slate-100 rounded p-1 text-center">
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Hour</span>
                            <span className="font-extrabold text-slate-700 truncate max-w-full">
                              {durationMins > 0 ? formatMinsToDisplay(durationMins) : "—"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
        </div>
      </div>
    </div>

      {/* MODAL: ADD / EDIT ROUTINE SLOT */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className={cn(
                "bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-row transition-all duration-300 my-auto",
                isRoomDropdownOpen && formClassMode === "offline" ? "w-full max-w-5xl" : "w-full max-w-3xl sm:max-w-4xl"
              )}
            >
              {/* INNER LEFT PANEL: ROOM SELECTION (INSIDE THE MODAL) */}
              <AnimatePresence initial={false}>
                {isRoomDropdownOpen && formClassMode === "offline" && (
                  <motion.div
                    ref={roomDropdownRef}
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: "270px", opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ type: "spring", damping: 25, stiffness: 280 }}
                    className="border-r border-slate-200 bg-slate-50/70 flex flex-col shrink-0 overflow-hidden"
                  >
                    {/* Header */}
                    <div className="p-3.5 border-b border-slate-200/80 bg-slate-100/80 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-800">Select Room No</h4>
                          <p className="text-[10px] text-slate-500 font-medium">{existingRooms.length} rooms available</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsRoomDropdownOpen(false)}
                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Search Bar */}
                    <div className="p-2.5 border-b border-slate-200/60 bg-white">
                      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus-within:border-teal-500 shadow-2xs">
                        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <input
                          type="text"
                          autoFocus
                          placeholder="Search or enter room..."
                          value={roomSearchQuery}
                          onChange={(e) => setRoomSearchQuery(e.target.value)}
                          className="w-full bg-transparent border-none outline-none text-xs text-slate-800 font-medium"
                        />
                        {roomSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setRoomSearchQuery("")}
                            className="text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* List of Rooms */}
                    <div className="overflow-y-auto p-2 flex-1 space-y-1 max-h-[380px]">
                      {filteredRoomOptions.length > 0 &&
                        filteredRoomOptions.map((rmOpt, idx) => {
                          const isSelected = formNote === rmOpt;
                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                setFormNote(rmOpt);
                                setIsRoomDropdownOpen(false);
                              }}
                              className={cn(
                                "px-3 py-2 text-xs rounded-xl cursor-pointer flex items-center justify-between transition-all group",
                                isSelected
                                  ? "bg-teal-600 text-white font-bold shadow-2xs"
                                  : "text-slate-700 hover:bg-slate-200/70 font-medium"
                              )}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <Building2 className={cn("w-3.5 h-3.5 shrink-0", isSelected ? "text-white" : "text-slate-400 group-hover:text-slate-600")} />
                                <span className="truncate">{rmOpt}</span>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-white shrink-0 ml-1" />}
                            </div>
                          );
                        })}

                      {/* Option to add custom room if typed */}
                      {roomSearchQuery.trim() &&
                        !existingRooms.some(
                          (r) => r.toLowerCase() === roomSearchQuery.trim().toLowerCase()
                        ) && (
                          <div
                            onClick={() => {
                              setFormNote(roomSearchQuery.trim());
                              setIsRoomDropdownOpen(false);
                            }}
                            className="p-2.5 text-xs text-teal-800 bg-teal-50 hover:bg-teal-100 cursor-pointer font-bold flex items-center gap-2 rounded-xl border border-teal-200/80 transition-colors mt-1"
                          >
                            <Plus className="w-4 h-4 text-teal-600 shrink-0" />
                            <span>Use &quot;{roomSearchQuery.trim()}&quot; as Room</span>
                          </div>
                        )}

                      {filteredRoomOptions.length === 0 && !roomSearchQuery.trim() && (
                        <div className="px-3 py-8 text-xs text-slate-400 text-center font-medium">
                          No rooms found. Type in search above to add a room.
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* MAIN FORM PANEL (RIGHT SIDE INSIDE MODAL) */}
              <div className="flex-1 flex flex-col justify-between min-w-0 bg-white">
                {/* Modal Header */}
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-teal-100 text-teal-700">
                      <CalendarDays className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800">
                      {editingEvent ? "Edit Class Routine" : "Add Class Routine"}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-md transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSaveRoutineSlot} className="p-5 space-y-4 flex-1">
                  {saveError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-700">
                      {saveError}
                    </div>
                  )}

                  {/* SEARCHABLE SELECT BATCH DROPDOWN */}
                  <div className="relative" ref={batchDropdownRef}>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Select Batch <span className="text-rose-500">*</span>
                    </label>

                    <>
                      <div
                        onClick={() => setIsBatchDropdownOpen(!isBatchDropdownOpen)}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:border-teal-500 outline-none bg-white cursor-pointer font-bold flex items-center justify-between shadow-2xs hover:border-slate-300 transition-colors"
                      >
                        <span className="truncate text-slate-800">
                          {currentSelectedBatchObj
                            ? formatBatchDisplay(currentSelectedBatchObj)
                            : "Search & Select Batch..."}
                        </span>
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      </div>

                      {isBatchDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 flex flex-col max-h-56 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                          <div className="p-2 border-b border-slate-100 flex items-center gap-1.5 shrink-0 bg-slate-50/80">
                            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <input
                              type="text"
                              autoFocus
                              placeholder="Search course or batch no..."
                              value={batchSearchQuery}
                              onChange={(e) => setBatchSearchQuery(e.target.value)}
                              className="w-full bg-transparent border-none outline-none text-xs text-slate-700 font-medium"
                            />
                            {batchSearchQuery && (
                              <button
                                type="button"
                                onClick={() => setBatchSearchQuery("")}
                                className="text-slate-400 hover:text-slate-600 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          <div className="overflow-y-auto p-1 flex-1 space-y-0.5">
                            {filteredBatchOptions.length > 0 ? (
                              filteredBatchOptions.map((bOpt, idx) => {
                                const bKey = getBatchUniqueKey(bOpt);
                                const isSelected = formBatchNumber === bKey;
                                return (
                                  <div
                                    key={`${bKey}-${idx}`}
                                    onClick={() => {
                                      setFormBatchNumber(bKey);
                                      setIsBatchDropdownOpen(false);
                                    }}
                                    className={cn(
                                      "px-3 py-2 text-xs rounded-lg cursor-pointer flex items-center justify-between transition-colors",
                                      isSelected
                                        ? "bg-teal-50 text-teal-900 font-bold border border-teal-200/60"
                                        : "text-slate-700 hover:bg-slate-100 font-medium"
                                    )}
                                  >
                                    <span className="truncate">{formatBatchDisplay(bOpt)}</span>
                                    {isSelected && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0 ml-1" />}
                                  </div>
                                );
                              })
                            ) : (
                              <div className="px-3 py-4 text-xs text-slate-400 text-center font-medium">
                                No batches found
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  </div>

                  {/* Date Input and Attendance Upload */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Class Date <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        required
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold focus:bg-white focus:border-teal-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Upload Attendance
                      </label>
                      <div className="flex items-center gap-2">
                        <input 
                          type="file"
                          ref={fileInputRef}
                          className="hidden"
                          onChange={handleAttendanceUpload}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingAttendance}
                          className="w-full flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isUploadingAttendance ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Uploading...</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>{formAttendanceUrl ? "Change File" : "Select File"}</span>
                            </>
                          )}
                        </button>
                        {formAttendanceUrl && (
                          <a 
                            href={formAttendanceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 px-3 bg-teal-50 text-teal-600 rounded-lg border border-teal-200 hover:bg-teal-100 transition-colors shrink-0 flex items-center gap-1.5"
                            title="View Uploaded Attendance"
                          >
                            <Eye className="w-4 h-4" />
                            <span className="text-xs font-bold">View</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Time Inputs */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Start Time <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="time"
                        value={formStartTime}
                        onChange={(e) => setFormStartTime(e.target.value)}
                        required
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold focus:bg-white focus:border-teal-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        End Time <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="time"
                        value={formEndTime}
                        onChange={(e) => setFormEndTime(e.target.value)}
                        required
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold focus:bg-white focus:border-teal-500 outline-none transition-all"
                      />
                    </div>
                  </div>

                  {/* Class Mode & Room No / Link in a 2-column row */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Class Mode Switcher */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Class Mode</label>
                      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200/60">
                        <button
                          type="button"
                          onClick={() => setFormClassMode("offline")}
                          className={cn(
                            "py-1.5 px-2 rounded-md text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
                            formClassMode === "offline"
                              ? "bg-white text-indigo-700 shadow-2xs border border-slate-200/50"
                              : "text-slate-600 hover:text-slate-800"
                          )}
                        >
                          <Building2 className="w-3.5 h-3.5" />
                          <span>Offline</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFormClassMode("online");
                            setIsRoomDropdownOpen(false);
                          }}
                          className={cn(
                            "py-1.5 px-2 rounded-md text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
                            formClassMode === "online"
                              ? "bg-white text-teal-700 shadow-2xs border border-slate-200/50"
                              : "text-slate-600 hover:text-slate-800"
                          )}
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Online</span>
                        </button>
                      </div>
                    </div>

                    {/* Room No or Class Link */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {formClassMode === "online" ? "Google Meet / Class Link" : "Room No"} <span className="text-rose-500">*</span>
                      </label>

                      {formClassMode === "online" ? (
                        <input
                          type="text"
                          placeholder="https://meet.google.com/..."
                          value={formNote}
                          onChange={(e) => setFormNote(e.target.value)}
                          required
                          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:bg-white focus:border-teal-500 outline-none transition-all"
                        />
                      ) : (
                        /* SEARCHABLE & ADDABLE ROOM TRIGGER */
                        <div ref={roomTriggerRef}>
                          <div
                            onClick={() => setIsRoomDropdownOpen(!isRoomDropdownOpen)}
                            className={cn(
                              "w-full px-3 py-2 text-xs border rounded-lg outline-none bg-white cursor-pointer font-bold flex items-center justify-between shadow-2xs transition-all",
                              isRoomDropdownOpen
                                ? "border-teal-500 ring-2 ring-teal-500/10 text-teal-800"
                                : "border-slate-200 hover:border-slate-300 text-slate-800"
                            )}
                          >
                            <span className="truncate">
                              {formNote || "Select Room..."}
                            </span>
                            <ChevronDown className={cn("w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200", isRoomDropdownOpen && "rotate-180 text-teal-600")} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Modal Footer Buttons */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  {editingEvent ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        setIsModalOpen(false);
                        handleDeleteRoutineSlot(editingEvent, e);
                      }}
                      className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    >
                      Delete Slot
                    </button>
                  ) : <div />}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving || (editingEvent && !hasChanges)}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      <span>{editingEvent ? "Update Routine" : "Save Routine"}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* RIGHT SIDE: SELECTED BATCH INFO PANEL */}
            <div className="w-full sm:w-72 md:w-80 border-l border-slate-200 bg-slate-50/70 flex flex-col shrink-0 overflow-hidden rounded-r-2xl">
              {/* Header */}
              <div className="p-2.5 bg-white border-b border-slate-200/80 flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <div className="p-1 rounded-lg bg-teal-50 text-teal-700 shrink-0">
                    <BookOpen className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-[11px] font-bold text-slate-800 truncate">
                      {currentSelectedBatchObj ? (
                        currentSelectedBatchObj["Course Code"] 
                          ? `${currentSelectedBatchObj["Course Code"]} - ${currentSelectedBatchObj["Batch Number"] || currentSelectedBatchObj["batchNumber"]}`
                          : (currentSelectedBatchObj["Batch Number"] || currentSelectedBatchObj["batchNumber"] || "Batch Info")
                      ) : (
                        "Batch Info"
                      )}
                    </h4>
                    <p className="text-[9px] text-slate-500 font-medium truncate">
                      {currentSelectedBatchObj ? selectedCourseTitle : "No batch selected"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-2.5 flex-1 overflow-y-auto space-y-2.5 max-h-[500px]">
                {currentSelectedBatchObj ? (
                  <>
                    {/* Instructor Profiles with Horizontal Scroll */}
                    {(() => {
                      const instructors = getBatchInstructorList(currentSelectedBatchObj);
                      if (instructors.length === 0) return null;
                      return (
                        <div className="space-y-1">
                          <div className="flex gap-2 justify-center items-center overflow-x-auto pb-1.5 scrollbar-thin snap-x w-full">
                            {instructors.map((emp: any, i: number) => (
                              <div 
                                key={i} 
                                className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200/60 shadow-3xs text-left relative shrink-0 w-[180px] snap-start"
                              >
                                {/* Instructor badge inside card in top-right corner */}
                                <span className="absolute top-1 right-1 text-[7.5px] font-bold text-teal-600 bg-teal-50 px-1 py-0.2 rounded border border-teal-100 uppercase tracking-tight scale-90 origin-top-right">
                                  Instructor
                                </span>

                                <div className="w-8 h-8 rounded-full bg-slate-100 overflow-hidden shrink-0 border border-slate-200 mt-1">
                                  <img 
                                    src={getPhotoUrl(emp)} 
                                    alt={emp['Employee Name'] || emp['name'] || 'Instructor'}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(emp['Employee Name'] || emp['name'] || 'User') + '&background=0D9488&color=fff';
                                    }}
                                  />
                                </div>
                                <div className="min-w-0 flex-1 pr-6 mt-1">
                                  <p className="text-[10.5px] font-bold text-slate-900 truncate">
                                    {emp['Employee Name'] || emp['name'] || 'Unknown'}
                                  </p>
                                  <p className="text-[9px] font-medium text-slate-500 truncate">
                                    {emp['Designation'] || emp['designation'] || 'Instructor'}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Added Class Routine Slots with Scrollable container */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                          <CalendarDays className="w-3 h-3 text-teal-600" />
                          Added Routine Slots ({selectedBatchRoutineItems.length})
                        </span>
                      </div>

                      {selectedBatchRoutineItems.length === 0 ? (
                        <div className="p-3 bg-white rounded-xl border border-slate-200 text-center text-slate-400">
                          <p className="text-[10px] font-medium text-slate-500">No class routine added yet.</p>
                        </div>
                      ) : (
                        <div className="space-y-1 max-h-[160px] overflow-y-auto pr-0.5">
                          {selectedBatchRoutineItems.map((slot, sIdx) => {
                            const isOnline = slot.classMode === "online" || (slot.note && (slot.note.startsWith("http") || slot.note.toLowerCase().includes("meet.")));
                            return (
                              <div
                                key={slot.id || sIdx}
                                className="p-2 bg-white rounded-lg border border-slate-200/80 shadow-3xs flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex items-center gap-1 text-[10.5px] font-bold text-slate-900">
                                    <Calendar className="w-2.5 h-2.5 text-teal-600 shrink-0" />
                                    <span>{formatDateWithDay(slot.date)}</span>
                                  </div>
                                  <div className="text-[9.5px] text-slate-500 font-medium flex items-center gap-1">
                                    <Clock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                    <span>{formatTime12h(slot.startTime)} - {formatTime12h(slot.endTime)}</span>
                                  </div>
                                </div>
                                <div className="shrink-0 flex items-center gap-1.5 flex-col">
                                  {isOnline ? (
                                    <span className="px-1 py-0.5 bg-teal-50 text-teal-800 rounded text-[9px] font-bold border border-teal-100 flex items-center gap-0.5">
                                      <Video className="w-2.5 h-2.5" /> Online
                                    </span>
                                  ) : (
                                    <span className="px-1 py-0.5 bg-indigo-50 text-indigo-800 rounded text-[9px] font-bold border border-indigo-100 flex items-center gap-0.5 max-w-[80px] truncate">
                                      <Building2 className="w-2.5 h-2.5 shrink-0" /> <span className="truncate">{slot.note || "Offline"}</span>
                                    </span>
                                  )}
                                  {slot.attendanceUrl && (
                                    <a
                                      href={slot.attendanceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-1 py-0.5 bg-teal-50 text-teal-600 rounded text-[9px] font-bold border border-teal-200 hover:bg-teal-100 transition-colors flex items-center gap-0.5"
                                      title="View Attendance"
                                    >
                                      <Eye className="w-2.5 h-2.5" /> Attendance
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="p-6 text-center text-slate-400 space-y-1.5 my-auto">
                    <BookOpen className="w-7 h-7 mx-auto text-slate-300" />
                    <p className="text-[11px] font-bold text-slate-700">Select a Batch</p>
                    <p className="text-[10px] text-slate-500">
                      Choose a batch on the left to view details.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>

      {/* MODAL: VIEW ALL CLASSES FOR A SPECIFIC DAY */}
      <AnimatePresence>
        {selectedDayEvents && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-teal-600" />
                  <h3 className="text-sm font-bold text-slate-800">
                    Classes on {formatToMmmDdYyyy(selectedDayEvents.dateStr)}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDayEvents(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-md cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2.5">
                {selectedDayEvents.events.map((ev) => {
                  const isOnline = ev.classMode === "online";
                  return (
                    <div
                      key={ev.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 hover:border-teal-300 transition-all"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold text-xs text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                            {ev.courseCode ? `${ev.courseCode} - ${ev.batchNumber}` : ev.batchNumber}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-2 pt-0.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatTime12h(ev.startTime)} - {formatTime12h(ev.endTime)}</span>
                          {ev.note && <span className="font-bold text-slate-700">({ev.note})</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleOpenEditModal(ev, e)}
                          className="p-1.5 hover:bg-slate-200/80 text-slate-600 rounded-lg cursor-pointer"
                          title="Edit"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteRoutineSlot(ev, e)}
                          className="p-1.5 hover:bg-rose-100 text-rose-600 rounded-lg cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={Boolean(deletingEvent)}
        onClose={() => setDeletingEvent(null)}
        onConfirm={confirmDeleteRoutineSlot}
        title="Delete Routine Slot"
        message={`Are you sure you want to delete this routine slot for ${deletingEvent?.batchNumber} on ${deletingEvent?.date}?`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
