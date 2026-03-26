import * as React from 'react';
import { useState, useEffect, useMemo, Component } from 'react';
import { 
  Plus, 
  Calendar, 
  TrendingUp, 
  Trash2, 
  FileText, 
  ChevronLeft, 
  ChevronRight,
  Package,
  Scale,
  Save,
  History,
  LayoutDashboard,
  Eye,
  Download,
  Pencil,
  X,
  Loader2,
  Database,
  Upload,
  Truck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  format, 
  subDays, 
  addDays,
  startOfToday, 
  parseISO, 
  isWithinInterval, 
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  isSameDay,
  startOfWeek,
  endOfWeek
} from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as XLSX from 'xlsx';
import { db, handleFirestoreError, OperationType } from './firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  serverTimestamp,
  orderBy,
  writeBatch,
  getDocs,
  getDoc
} from 'firebase/firestore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StockRecord {
  id: string;
  date: string;
  kilos: number;
  created_at: any;
  uid: string;
}

interface SavedReport {
  id: string;
  month: string;
  period: string;
  total_kilos: number;
  avg_kilos: number;
  data_json: any;
  created_at: any;
  uid: string;
}

interface PalletRecord {
  id: string;
  date: string;
  positions: number;
  created_at: any;
  uid: string;
}

interface PalletReport {
  id: string;
  week_start: string;
  week_end: string;
  total_positions: number;
  avg_positions: number;
  data_json: any;
  created_at: any;
  uid: string;
}

interface CepasRecord {
  id: string;
  date: string;
  positions: number;
  created_at: any;
  uid: string;
}

interface CepasReport {
  id: string;
  month: string;
  total_positions: number;
  avg_positions: number;
  data_json: any;
  created_at: any;
  uid: string;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: any;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    (this as any).state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: any) {
    try {
      const info = JSON.parse(error.message);
      return { hasError: true, errorInfo: info };
    } catch (e) {
      return { hasError: true, errorInfo: { error: error.message } };
    }
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    const { hasError, errorInfo } = (this as any).state;
    if (hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <X className="text-red-500" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Algo salió mal</h1>
          <p className="text-slate-400 max-w-md mb-8">
            Hubo un problema al procesar tu solicitud. Por favor, intenta recargar la página.
          </p>
          {errorInfo && errorInfo.error && (
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 mb-8 text-left max-w-lg overflow-auto">
              <p className="text-[10px] font-mono text-red-400 uppercase tracking-widest mb-2">Detalles del error:</p>
              <p className="text-xs font-mono text-slate-500">{errorInfo.error}</p>
            </div>
          )}
          <button 
            onClick={() => window.location.reload()}
            className="bg-emerald-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-emerald-500 transition-all active:scale-[0.98]"
          >
            Recargar Aplicación
          </button>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

export default function App() {
  const [records, setRecords] = useState<StockRecord[]>([]);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [palletRecords, setPalletRecords] = useState<PalletRecord[]>([]);
  const [palletReports, setPalletReports] = useState<PalletReport[]>([]);
  const [cepasRecords, setCepasRecords] = useState<CepasRecord[]>([]);
  const [cepasReports, setCepasReports] = useState<CepasReport[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'bianchi' | 'cepas' | 'backup'>('dashboard');
  const [selectedReport, setSelectedReport] = useState<SavedReport | null>(null);
  const [selectedPalletReport, setSelectedPalletReport] = useState<PalletReport | null>(null);
  const [selectedCepasReport, setSelectedCepasReport] = useState<CepasReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [minLoadingTimePassed, setMinLoadingTimePassed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [newDate, setNewDate] = useState(format(startOfToday(), 'yyyy-MM-dd'));
  const [newKilos, setNewKilos] = useState<string>('');
  const [newPalletDate, setNewPalletDate] = useState(format(startOfToday(), 'yyyy-MM-dd'));
  const [newPositions, setNewPositions] = useState<string>('');
  const [newCepasDate, setNewCepasDate] = useState(format(startOfToday(), 'yyyy-MM-dd'));
  const [newCepasPositions, setNewCepasPositions] = useState<string>('');
  const [reportPeriod, setReportPeriod] = useState<'first' | 'second'>('first');
  const [reportMonth, setReportMonth] = useState(format(startOfToday(), 'yyyy-MM'));
  const [cepasReportMonth, setCepasReportMonth] = useState(format(startOfToday(), 'yyyy-MM'));
  const [palletReportDate, setPalletReportDate] = useState(format(startOfToday(), 'yyyy-MM-dd'));
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditingPallet, setIsEditingPallet] = useState(false);
  const [editingPalletId, setEditingPalletId] = useState<string | null>(null);
  const [isEditingCepas, setIsEditingCepas] = useState(false);
  const [editingCepasId, setEditingCepasId] = useState<string | null>(null);

  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ 
    title: string, 
    message: string, 
    onConfirm: () => void, 
    onCancel?: () => void 
  } | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<string>('');

  const fetchData = async () => {
    // This is now handled by onSnapshot listeners in useEffect
  };

  useEffect(() => {
    setLoading(true);
    const qRecords = query(collection(db, 'records'), orderBy('date', 'desc'));
    const qReports = query(collection(db, 'reports'), orderBy('created_at', 'desc'));
    const qPallets = query(collection(db, 'pallets'), orderBy('date', 'desc'));
    const qPalletReports = query(collection(db, 'pallet_reports'), orderBy('created_at', 'desc'));
    const qCepas = query(collection(db, 'cepas'), orderBy('date', 'desc'));
    const qCepasReports = query(collection(db, 'cepas_reports'), orderBy('created_at', 'desc'));

    const unsubRecords = onSnapshot(qRecords, (snap) => {
      setRecords(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockRecord)));
    });
    const unsubReports = onSnapshot(qReports, (snap) => {
      setSavedReports(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SavedReport)));
    });
    const unsubPallets = onSnapshot(qPallets, (snap) => {
      setPalletRecords(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PalletRecord)));
    });
    const unsubPalletReports = onSnapshot(qPalletReports, (snap) => {
      setPalletReports(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PalletReport)));
    });
    const unsubCepas = onSnapshot(qCepas, (snap) => {
      setCepasRecords(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CepasRecord)));
    });
    const unsubCepasReports = onSnapshot(qCepasReports, (snap) => {
      setCepasReports(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CepasReport)));
      setLoading(false);
    });

    return () => {
      unsubRecords();
      unsubReports();
      unsubPallets();
      unsubPalletReports();
      unsubCepas();
      unsubCepasReports();
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinLoadingTimePassed(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (loading || !minLoadingTimePassed) {
      const timer = setInterval(() => {
        setProgress((oldProgress) => {
          if (oldProgress >= 95) return 95; // Stay at 95 until loading is false
          const diff = Math.random() * 10;
          return Math.min(oldProgress + diff, 95);
        });
      }, 100);
      return () => clearInterval(timer);
    } else {
      setProgress(100);
    }
  }, [loading, minLoadingTimePassed]);

  const safeSetItem = (key: string, value: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('LocalStorage full or disabled:', e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate || !newKilos) {
      return;
    }

    try {
      const kilosNum = parseFloat(newKilos);
      if (isNaN(kilosNum)) {
        setNotification({ message: 'Por favor ingrese un número válido para los kilos.', type: 'error' });
        return;
      }

      if (isEditing && editingId) {
        await updateDoc(doc(db, 'records', editingId), {
          date: newDate,
          kilos: kilosNum
        });
        setNotification({ message: 'Registro actualizado con éxito', type: 'success' });
      } else {
        await addDoc(collection(db, 'records'), {
          date: newDate,
          kilos: kilosNum,
          created_at: serverTimestamp()
        });
        setNotification({ message: 'Registro guardado con éxito', type: 'success' });
      }

      setNewKilos('');
      setIsEditing(false);
      setEditingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'records');
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmModal({
      title: '¿Eliminar registro?',
      message: '¿Estás seguro de eliminar este registro? Esta acción no se puede deshacer.',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'records', id));
          if (isEditing && editingId === id) {
            setIsEditing(false);
            setEditingId(null);
            setNewKilos('');
          }
          setNotification({ message: 'Registro eliminado', type: 'success' });
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'records');
        }
      }
    });
  };

  const handleEdit = (record: StockRecord) => {
    setNewDate(record.date);
    setNewKilos(record.kilos.toString());
    setIsEditing(true);
    setEditingId(record.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setNewKilos('');
    setNewDate(format(startOfToday(), 'yyyy-MM-dd'));
  };

  const handleSaveReport = async () => {
    if (reportData.filter(d => d.hasData).length === 0) {
      setNotification({ message: 'No hay datos registrados en esta quincena para guardar.', type: 'info' });
      return;
    }

    try {
      await addDoc(collection(db, 'reports'), {
        month: reportMonth,
        period: reportPeriod,
        total_kilos: totalKilos,
        avg_kilos: avgKilos,
        data_json: reportData,
        created_at: serverTimestamp()
      });

      setNotification({ message: '¡Quincena guardada y almacenada en el historial con éxito!', type: 'success' });
      
      setConfirmModal({
        title: 'Limpiar registros',
        message: '¿Deseas limpiar los registros diarios de esta quincena ahora que ha sido guardada? (Esto no borrará el informe del historial)',
        onConfirm: () => handleClearPeriodRecords()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'reports');
    }
  };

  const handlePalletSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPalletDate || !newPositions) {
      return;
    }

    try {
      const posNum = parseInt(newPositions);
      if (isNaN(posNum)) {
        setNotification({ message: 'Por favor ingrese un número válido para las posiciones.', type: 'error' });
        return;
      }

      if (isEditingPallet && editingPalletId) {
        await updateDoc(doc(db, 'pallets', editingPalletId), {
          date: newPalletDate,
          positions: posNum
        });
        setNotification({ message: 'Registro de Bianchi actualizado', type: 'success' });
      } else {
        await addDoc(collection(db, 'pallets'), {
          date: newPalletDate,
          positions: posNum,
          created_at: serverTimestamp()
        });
        setNotification({ message: 'Registro de Bianchi guardado', type: 'success' });
      }

      setNewPositions('');
      setIsEditingPallet(false);
      setEditingPalletId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'pallets');
    }
  };

  const handlePalletDelete = async (id: string) => {
    setConfirmModal({
      title: '¿Eliminar registro?',
      message: '¿Estás seguro de eliminar este registro de posiciones?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'pallets', id));
          if (isEditingPallet && editingPalletId === id) {
            setIsEditingPallet(false);
            setEditingPalletId(null);
            setNewPositions('');
          }
          setNotification({ message: 'Registro eliminado', type: 'success' });
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'pallets');
        }
      }
    });
  };

  const handlePalletEdit = (record: PalletRecord) => {
    setNewPalletDate(record.date);
    setNewPositions(record.positions.toString());
    setIsEditingPallet(true);
    setEditingPalletId(record.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCepasSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCepasDate || !newCepasPositions) {
      return;
    }

    try {
      const posNum = parseInt(newCepasPositions);
      if (isNaN(posNum)) {
        setNotification({ message: 'Por favor ingrese un número válido para las posiciones.', type: 'error' });
        return;
      }

      if (isEditingCepas && editingCepasId) {
        await updateDoc(doc(db, 'cepas', editingCepasId), {
          date: newCepasDate,
          positions: posNum
        });
        setNotification({ message: 'Registro de Cepas actualizado', type: 'success' });
      } else {
        await addDoc(collection(db, 'cepas'), {
          date: newCepasDate,
          positions: posNum,
          created_at: serverTimestamp()
        });
        setNotification({ message: 'Registro de Cepas guardado', type: 'success' });
      }

      setNewCepasPositions('');
      setIsEditingCepas(false);
      setEditingCepasId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'cepas');
    }
  };

  const handleCepasDelete = async (id: string) => {
    setConfirmModal({
      title: '¿Eliminar registro?',
      message: '¿Estás seguro de eliminar este registro de Cepas?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'cepas', id));
          if (isEditingCepas && editingCepasId === id) {
            setIsEditingCepas(false);
            setEditingCepasId(null);
            setNewCepasPositions('');
          }
          setNotification({ message: 'Registro eliminado', type: 'success' });
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'cepas');
        }
      }
    });
  };

  const handleCepasEdit = (record: CepasRecord) => {
    setNewCepasDate(record.date);
    setNewCepasPositions(record.positions.toString());
    setIsEditingCepas(true);
    setEditingCepasId(record.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveCepasReport = async (monthData: any[], month: string, total: number, avg: number) => {
    try {
      await addDoc(collection(db, 'cepas_reports'), {
        month: month,
        total_positions: total,
        avg_positions: avg,
        data_json: monthData,
        created_at: serverTimestamp()
      });
      setNotification({ message: 'Reporte mensual guardado con éxito', type: 'success' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'cepas_reports');
    }
  };

  const handleDeleteCepasReport = async (id: string) => {
    setConfirmModal({
      title: '¿Eliminar reporte?',
      message: '¿Estás seguro de eliminar este reporte mensual?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'cepas_reports', id));
          setNotification({ message: 'Reporte eliminado', type: 'success' });
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'cepas_reports');
        }
      }
    });
  };

  const handleSavePalletReport = async (weekData: any[], start: string, end: string, total: number, avg: number) => {
    try {
      await addDoc(collection(db, 'pallet_reports'), {
        week_start: start,
        week_end: end,
        total_positions: total,
        avg_positions: avg,
        data_json: weekData,
        created_at: serverTimestamp()
      });
      setNotification({ message: 'Reporte semanal de Bodegas Bianchi guardado con éxito.', type: 'success' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'pallet_reports');
    }
  };

  const handleDeletePalletReport = async (id: string) => {
    setConfirmModal({
      title: '¿Eliminar reporte?',
      message: '¿Estás seguro de eliminar este reporte semanal?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'pallet_reports', id));
          setNotification({ message: 'Reporte eliminado', type: 'success' });
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'pallet_reports');
        }
      }
    });
  };

  // Helper for weekly data (Bodegas Bianchi)
  const currentWeekData = useMemo(() => {
    const baseDate = parseISO(palletReportDate);
    const monday = startOfWeek(baseDate, { weekStartsOn: 1 });
    const sunday = endOfWeek(baseDate, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: monday, end: sunday });

    const data = days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const record = palletRecords.find(r => r.date === dateStr);
      return {
        date: dateStr,
        displayDate: format(day, 'EEEE dd', { locale: es }),
        positions: record ? record.positions : 0,
        hasData: !!record
      };
    });

    const total = data.reduce((acc, curr) => acc + curr.positions, 0);
    const avg = data.filter(d => d.hasData).length > 0 ? total / data.filter(d => d.hasData).length : 0;

    return { data, total, avg, start: format(monday, 'yyyy-MM-dd'), end: format(sunday, 'yyyy-MM-dd') };
  }, [palletRecords, palletReportDate]);

  // Helper for monthly data (Cepas)
  const cepasMonthlyData = useMemo(() => {
    const [year, month] = cepasReportMonth.split('-').map(Number);
    const start = startOfMonth(new Date(year, month - 1));
    const end = endOfMonth(start);
    const days = eachDayOfInterval({ start, end });

    const data = days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const record = cepasRecords.find(r => r.date === dateStr);
      return {
        date: dateStr,
        displayDate: format(day, 'dd/MM'),
        positions: record ? record.positions : 0,
        hasData: !!record
      };
    });

    const total = data.reduce((acc, curr) => acc + curr.positions, 0);
    const avg = data.filter(d => d.hasData).length > 0 ? total / data.filter(d => d.hasData).length : 0;

    return { data, total, avg, month: cepasReportMonth };
  }, [cepasRecords, cepasReportMonth]);

  const handleExportPalletExcel = (data: any[], start: string, end: string) => {
    const dataToExport = data.map(day => ({
      'Fecha': day.date,
      'Día': day.displayDate,
      'Posiciones': day.positions,
      'Estado': day.hasData ? 'Registrado' : 'Sin datos'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte Bianchi");
    XLSX.writeFile(wb, `Reporte_Bianchi_${start}_al_${end}.xlsx`);
  };

  const handleExportCepasExcel = (data: any[], month: string) => {
    const dataToExport = data.map(day => ({
      'Fecha': day.date,
      'Posiciones': day.positions,
      'Estado': day.hasData ? 'Registrado' : 'Sin datos'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte Cepas");
    XLSX.writeFile(wb, `Reporte_Cepas_${month}.xlsx`);
  };

  const handleClearPeriodRecords = async () => {
    const idsToDelete = records
      .filter(r => reportData.some(d => d.date === r.date))
      .map(r => r.id);

    if (idsToDelete.length === 0) return;

    setLoading(true);
    try {
      const batch = writeBatch(db);
      idsToDelete.forEach(id => {
        batch.delete(doc(db, 'records', id));
      });
      await batch.commit();
      setNotification({ message: 'Registros diarios limpiados con éxito', type: 'success' });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'records');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReport = async (id: string) => {
    setConfirmModal({
      title: '¿Eliminar informe?',
      message: '¿Estás seguro de eliminar este informe guardado?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'reports', id));
          setNotification({ message: 'Informe eliminado', type: 'success' });
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'reports');
        }
      }
    });
  };

  const handleExportExcel = (data: any[], month: string, period: string, avg: number) => {
    const dataToExport = data.map(day => ({
      'Fecha': day.date,
      'Día': day.displayDate,
      'Kilos': day.kilos,
      'Estado': day.hasData ? 'Registrado' : 'Sin datos'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte Quincenal");

    // Add summary info
    XLSX.utils.sheet_add_aoa(ws, [
      [],
      ["Resumen de Quincena"],
      ["Promedio Diario", avg.toFixed(2)]
    ], { origin: -1 });

    const fileName = `Reporte_Stock_${month}_${period === 'first' ? 'Q1' : 'Q2'}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // Report Logic
  const reportData = useMemo(() => {
    const [year, month] = reportMonth.split('-').map(Number);
    const baseDate = new Date(year, month - 1, 1);
    
    const start = reportPeriod === 'first' 
      ? baseDate 
      : new Date(year, month - 1, 16);
    
    const end = reportPeriod === 'first'
      ? new Date(year, month - 1, 15)
      : endOfMonth(baseDate);

    const days = eachDayOfInterval({ start, end });

    return days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const record = records.find(r => r.date === dateStr);
      return {
        date: dateStr,
        displayDate: format(day, 'dd MMM', { locale: es }),
        kilos: record ? record.kilos : 0,
        hasData: !!record
      };
    });
  }, [records, reportMonth, reportPeriod]);

  const totalKilos = useMemo(() => 
    reportData.reduce((sum, d) => sum + d.kilos, 0), 
  [reportData]);

  const avgKilos = useMemo(() => 
    reportData.length > 0 ? totalKilos / reportData.length : 0, 
  [totalKilos, reportData]);

  const handleExportBackup = () => {
    const backupData = {
      records,
      savedReports,
      palletRecords,
      palletReports,
      cepasRecords,
      cepasReports,
      version: '1.0',
      exportedAt: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_stock_${format(new Date(), 'yyyy-MM-dd_HHmm')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [importData, setImportData] = useState<any>(null);

  const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        
        if (!data.records && !data.palletRecords && !data.cepasRecords) {
          throw new Error('Formato de backup inválido: No se encontraron registros');
        }

        setImportData(data);
        setShowRestoreConfirm(true);
      } catch (err) {
        console.error('Import error:', err);
        setNotification({ 
          message: 'Error al importar el backup. Asegúrate de que el archivo sea un JSON válido de esta aplicación.', 
          type: 'error' 
        });
      }
    };
    reader.readAsText(file);
    // Reset input
    event.target.value = '';
  };

  const executeRestore = async () => {
    if (!importData) return;
    
    setShowRestoreConfirm(false);
    setLoading(true);
    setProgress(0);
    setRestoreStatus('Iniciando restauración...');

    const syncEntity = async (collName: string, items: any[], label: string) => {
      if (!items || !Array.isArray(items)) return;
      setRestoreStatus(`Sincronizando ${label}...`);
      
      const BATCH_SIZE = 400;
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = items.slice(i, i + BATCH_SIZE);
        
        chunk.forEach(item => {
          const { id, created_at, uid, ...data } = item;
          const docRef = doc(collection(db, collName));
          batch.set(docRef, {
            ...data,
            created_at: serverTimestamp()
          });
        });
        
        await batch.commit();
      }
    };

    try {
      if (importData.records) {
        await syncEntity('records', importData.records, 'Registros Kilos');
        setProgress(20);
      }
      if (importData.savedReports) {
        await syncEntity('reports', importData.savedReports, 'Reportes Quincenales');
        setProgress(40);
      }
      if (importData.palletRecords) {
        await syncEntity('pallets', importData.palletRecords, 'Registros Bianchi');
        setProgress(60);
      }
      if (importData.palletReports) {
        await syncEntity('pallet_reports', importData.palletReports, 'Reportes Bianchi');
        setProgress(75);
      }
      if (importData.cepasRecords) {
        await syncEntity('cepas', importData.cepasRecords, 'Registros Cepas');
        setProgress(90);
      }
      if (importData.cepasReports) {
        await syncEntity('cepas_reports', importData.cepasReports, 'Reportes Cepas');
        setProgress(95);
      }
      
      setRestoreStatus('Restauración completada');
      setNotification({ message: 'Backup restaurado con éxito. Los datos se han sincronizado con Firestore.', type: 'success' });
    } catch (err) {
      console.error('Error during restore sync:', err);
      setNotification({ message: 'Ocurrió un error durante la restauración.', type: 'error' });
    } finally {
      setLoading(false);
      setImportData(null);
      setProgress(100);
      setRestoreStatus('');
    }
  };

  const clearAllData = async () => {
    setShowClearConfirm(false);
    setLoading(true);
    setProgress(50);
    try {
      const collectionsToClear = ['records', 'reports', 'pallets', 'pallet_reports', 'cepas', 'cepas_reports'];
      
      for (const collName of collectionsToClear) {
        const q = query(collection(db, collName));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      
      // Clear local storage too to prevent auto-syncing old data
      localStorage.removeItem('stock_records_backup');
      localStorage.removeItem('stock_reports_backup_v2');
      localStorage.removeItem('pallet_records_backup');
      localStorage.removeItem('pallet_reports_backup');
      localStorage.removeItem('cepas_records_backup');
      localStorage.removeItem('cepas_reports_backup');
      
      setNotification({ message: 'Todos los datos han sido eliminados correctamente.', type: 'success' });
    } catch (err) {
      console.error('Clear error:', err);
      setNotification({ message: 'Error al intentar eliminar los datos del servidor.', type: 'error' });
    } finally {
      setLoading(false);
      setProgress(100);
    }
  };

  const viewSavedReport = (report: SavedReport) => {
    setSelectedReport(report);
    setActiveTab('dashboard');
    setReportMonth(report.month);
    setReportPeriod(report.period as 'first' | 'second');
  };

  const isAppLoading = loading || !minLoadingTimePassed;

  if (isAppLoading && progress < 100) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm space-y-10"
        >
          <div className="text-center space-y-3">
            <motion.h1 
              initial={{ letterSpacing: "0.1em", opacity: 0 }}
              animate={{ letterSpacing: "0.3em", opacity: 1 }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="text-4xl font-black text-emerald-500 uppercase drop-shadow-[0_0_15px_rgba(16,185,129,0.4)]"
            >
              Calico S.A.
            </motion.h1>
            <div className="flex items-center justify-center gap-2">
              <div className="h-[1px] w-8 bg-slate-800" />
              <p className="text-slate-600 text-[10px] uppercase tracking-[0.3em] font-mono">
                Logística Integral
              </p>
              <div className="h-[1px] w-8 bg-slate-800" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative h-6 w-full">
              <motion.div
                className="absolute top-0"
                initial={{ left: 0 }}
                animate={{ left: `${progress}%` }}
                transition={{ type: "spring", stiffness: 50, damping: 20 }}
                style={{ x: "-50%" }}
              >
                <Truck size={20} className="text-emerald-500 fill-emerald-500/10" />
              </motion.div>
            </div>
            <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800/30">
              <motion.div 
                className="h-full bg-emerald-600 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ type: "spring", stiffness: 50, damping: 20 }}
              />
            </div>
            <div className="flex justify-between items-center px-1">
              <div className="flex items-center gap-2">
                <Loader2 size={10} className="text-emerald-500 animate-spin" />
                <span className="text-[9px] text-slate-500 font-mono uppercase tracking-widest">
                  Sincronizando datos...
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono font-bold">
                {Math.round(progress)}%
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Package className="text-emerald-500" />
              Stock Posiciones Pro
            </h1>
            <p className="text-slate-400 mt-1 italic font-serif">
              Registro diario de kilos en stock con informes quincenales, semanales y mensuales detallados
            </p>
          </div>
          
          <div className="flex bg-slate-900 p-1 rounded-2xl border border-slate-800 shadow-xl">
            <button 
              onClick={() => setActiveTab('history')}
              className={cn(
                "flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-semibold transition-all",
                activeTab === 'history' ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <History size={18} />
              Historial
            </button>
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={cn(
                "flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-semibold transition-all",
                activeTab === 'dashboard' ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <LayoutDashboard size={18} />
              Raizen
            </button>
            <button 
              onClick={() => setActiveTab('bianchi')}
              className={cn(
                "flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-semibold transition-all",
                activeTab === 'bianchi' ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Package size={18} />
              Bodegas Bianchi
            </button>
            <button 
              onClick={() => setActiveTab('cepas')}
              className={cn(
                "flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-semibold transition-all",
                activeTab === 'cepas' ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <TrendingUp size={18} />
              Cepas
            </button>
            <button 
              onClick={() => setActiveTab('backup')}
              className={cn(
                "flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-semibold transition-all",
                activeTab === 'backup' ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Database size={18} />
              Backup
            </button>
          </div>
        </header>

        {activeTab === 'dashboard' ? (
          <>
            <div className="flex items-center gap-4 bg-slate-900 p-2 rounded-2xl shadow-xl border border-slate-800 w-fit">
              <div className="px-4 py-1">
                <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold block">Promedio Diario</span>
                <span className="text-xl font-mono font-bold text-slate-300">{avgKilos.toFixed(1)} kg</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Left Column: Input & History */}
              <div className="lg:col-span-1 space-y-6">
                {/* Input Form */}
                <section className="bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-800">
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 mb-6 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      {isEditing ? <Pencil size={16} className="text-amber-500" /> : <Plus size={16} />} 
                      {isEditing ? 'Editar Registro' : 'Nuevo Registro'}
                    </span>
                    {isEditing && (
                      <button 
                        onClick={cancelEdit}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-slate-400 flex items-center gap-1"
                      >
                        <X size={12} /> Cancelar
                      </button>
                    )}
                  </h2>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1 ml-1">Fecha</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                        <input 
                          type="date" 
                          value={newDate}
                          onChange={(e) => setNewDate(e.target.value)}
                          disabled={isEditing}
                          className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          required
                        />
                      </div>
                      {isEditing && <p className="text-[10px] text-amber-500/70 mt-1 ml-1">La fecha no se puede cambiar al editar</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1 ml-1">Kilos</label>
                      <div className="relative">
                        <Scale className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                        <input 
                          type="number" 
                          step="0.01"
                          placeholder="0.00"
                          value={newKilos}
                          onChange={(e) => setNewKilos(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all font-mono text-slate-200 appearance-none"
                          required
                          autoFocus={isEditing}
                        />
                      </div>
                    </div>
                    <button 
                      type="submit"
                      className={cn(
                        "w-full py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg",
                        isEditing 
                          ? "bg-amber-600 text-white hover:bg-amber-500 shadow-amber-900/20" 
                          : "bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-900/20"
                      )}
                    >
                      {isEditing ? 'Actualizar Registro' : 'Guardar Registro'}
                    </button>
                  </form>
                </section>

                {/* Recent History */}
                <section className="bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-800 overflow-hidden">
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
                    <TrendingUp size={16} /> Últimos Registros
                  </h2>
                  <div className="space-y-1 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {records.length === 0 ? (
                      <p className="text-center text-slate-600 py-8 italic">No hay registros aún</p>
                    ) : (
                      records.map((record) => (
                        <div 
                          key={record.id}
                          className="group flex items-center justify-between p-3 rounded-xl hover:bg-slate-800/50 transition-colors border-b border-slate-800 last:border-0"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-200">
                              {format(parseISO(record.date), 'EEEE, d MMMM', { locale: es })}
                            </p>
                            <p className="text-xs text-slate-500 font-mono">{record.date}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-300 mr-2">{record.kilos.toLocaleString()} kg</span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => handleEdit(record)}
                                className="p-2 text-slate-400 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-all"
                                title="Editar"
                              >
                                <Pencil size={16} />
                              </button>
                              <button 
                                onClick={() => handleDelete(record.id)}
                                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                title="Eliminar"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>

              {/* Right Column: Report & Charts */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Report Controls */}
                <section className="bg-slate-900 rounded-3xl p-8 shadow-xl border border-slate-800">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                    <div>
                      <h2 className="text-2xl font-bold flex items-center gap-2">
                        <FileText className="text-emerald-500" />
                        Informe Quincenal
                      </h2>
                      <p className="text-slate-400 text-sm">Visualización detallada por periodos de 15 días</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <input 
                        type="month" 
                        value={reportMonth}
                        onChange={(e) => setReportMonth(e.target.value)}
                        className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-slate-200"
                      />
                      <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                        <button 
                          onClick={() => setReportPeriod('first')}
                          className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                            reportPeriod === 'first' ? "bg-slate-800 text-slate-100 shadow-sm" : "text-slate-500 hover:text-slate-300"
                          )}
                        >
                          1ª Quincena
                        </button>
                        <button 
                          onClick={() => setReportPeriod('second')}
                          className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                            reportPeriod === 'second' ? "bg-slate-800 text-slate-100 shadow-sm" : "text-slate-500 hover:text-slate-300"
                          )}
                        >
                          2ª Quincena
                        </button>
                      </div>
                      <button 
                        onClick={handleSaveReport}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-all font-bold text-sm shadow-lg shadow-emerald-900/40"
                      >
                        <Save size={18} />
                        Finalizar y Guardar Quincena
                      </button>
                      <button 
                        onClick={() => handleExportExcel(reportData, reportMonth, reportPeriod, avgKilos)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600/10 text-blue-400 border border-blue-500/20 rounded-xl hover:bg-blue-600/20 transition-all font-semibold text-sm"
                      >
                        <Download size={18} />
                        Exportar Excel
                      </button>
                    </div>
                  </div>

                  {/* Chart */}
                  <div className="h-[300px] w-full mb-8">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={reportData}>
                        <defs>
                          <linearGradient id="colorKilos" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                        <XAxis 
                          dataKey="displayDate" 
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#64748b', fontSize: 12 }}
                          dy={10}
                        />
                        <YAxis 
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#64748b', fontSize: 12 }}
                          tickFormatter={(val) => `${val}kg`}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '16px', 
                            border: '1px solid #334155', 
                            backgroundColor: '#0f172a',
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)',
                            padding: '12px',
                            color: '#f8fafc'
                          }}
                          itemStyle={{ color: '#10b981' }}
                          labelStyle={{ fontWeight: 'bold', marginBottom: '4px', color: '#f8fafc' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="kilos" 
                          stroke="#10b981" 
                          strokeWidth={3}
                          fillOpacity={1} 
                          fill="url(#colorKilos)" 
                          animationDuration={1500}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Report Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800">
                          <th className="py-4 px-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Día</th>
                          <th className="py-4 px-4 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Kilos en Almacén</th>
                          <th className="py-4 px-4 text-xs font-semibold uppercase tracking-wider text-slate-400 text-right">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.map((day, idx) => (
                          <tr 
                            key={day.date} 
                            className={cn(
                              "group hover:bg-slate-800/50 transition-colors border-b border-slate-800 last:border-0",
                              !day.hasData && "opacity-40"
                            )}
                          >
                            <td className="py-4 px-4">
                              <span className="text-sm font-medium text-slate-200">{day.displayDate}</span>
                              <span className="text-xs text-slate-500 block font-mono">{day.date}</span>
                            </td>
                            <td className="py-4 px-4 text-right font-mono font-bold text-slate-300">
                              {day.kilos.toLocaleString()} kg
                            </td>
                            <td className="py-4 px-4 text-right">
                              {day.hasData ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  Registrado
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-500 border border-slate-700">
                                  Sin datos
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </div>
          </>
        ) : activeTab === 'history' ? (
          <section className="bg-slate-900 rounded-3xl p-8 shadow-xl border border-slate-800">
            <h2 className="text-2xl font-bold flex items-center gap-2 mb-8">
              <History className="text-emerald-500" />
              Informes Guardados
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {savedReports.length === 0 ? (
                <div className="col-span-full py-20 text-center">
                  <FileText size={48} className="mx-auto text-slate-800 mb-4" />
                  <p className="text-slate-500 italic">No hay informes guardados todavía.</p>
                </div>
              ) : (
                savedReports.map((report) => (
                  <div 
                    key={report.id}
                    className="bg-slate-950 border border-slate-800 rounded-2xl p-6 hover:border-emerald-500/30 transition-all group"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-slate-100">
                          {format(parseISO(`${report.month}-01`), 'MMMM yyyy', { locale: es })}
                        </h3>
                        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-500">
                          {report.period === 'first' ? '1ª Quincena' : '2ª Quincena'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            try {
                              const data = JSON.parse(report.data_json);
                              handleExportExcel(data, report.month, report.period, report.avg_kilos);
                            } catch (e) {
                              console.error("Error parsing report data", e);
                            }
                          }}
                          className="p-2 bg-slate-900 text-slate-400 hover:text-blue-400 rounded-lg transition-colors"
                          title="Exportar Excel"
                        >
                          <Download size={18} />
                        </button>
                        <button 
                          onClick={() => viewSavedReport(report)}
                          className="p-2 bg-slate-900 text-slate-400 hover:text-emerald-400 rounded-lg transition-colors"
                          title="Ver informe"
                        >
                          <Eye size={18} />
                        </button>
                        <button 
                          onClick={() => handleDeleteReport(report.id)}
                          className="p-2 bg-slate-900 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4 mt-6 pt-6 border-t border-slate-900">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block mb-1">Promedio</span>
                        <span className="text-lg font-mono font-bold text-slate-200">{report.avg_kilos.toFixed(1)} kg</span>
                      </div>
                    </div>
                    
                    <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-600">
                      <Calendar size={12} />
                      Guardado el {format(parseISO(report.created_at), 'd MMM, yyyy HH:mm', { locale: es })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : activeTab === 'bianchi' ? (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold text-slate-200">Bodegas Bianchi</h2>
                <p className="text-slate-400">Control semanal de posiciones de pallets</p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="bg-slate-900 p-2 rounded-2xl border border-slate-800 shadow-xl flex items-center gap-3">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold ml-2">Ver Semana:</span>
                  <input 
                    type="date" 
                    value={palletReportDate}
                    onChange={(e) => setPalletReportDate(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold block">Promedio Semanal</span>
                  <span className="text-xl font-mono font-bold text-emerald-500">{currentWeekData.avg.toFixed(1)} pos</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 space-y-6">
                <section className="bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-800">
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
                    {isEditingPallet ? <Pencil size={16} className="text-amber-500" /> : <Plus size={16} />} 
                    {isEditingPallet ? 'Editar Posiciones' : 'Nuevo Registro'}
                  </h2>
                  <form onSubmit={handlePalletSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1 ml-1">Fecha</label>
                      <input 
                        type="date" 
                        value={newPalletDate}
                        onChange={(e) => setNewPalletDate(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-200"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1 ml-1">Posiciones de Pallets</label>
                      <input 
                        type="number" 
                        placeholder="0"
                        value={newPositions}
                        onChange={(e) => setNewPositions(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-slate-200"
                        required
                      />
                    </div>
                    <button 
                      type="submit"
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      <Save size={18} />
                      {isEditingPallet ? 'Actualizar' : 'Guardar'}
                    </button>
                  </form>
                </section>

                <section className="bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-800">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Últimos Registros</h2>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                    {palletRecords.slice(0, 10).map((record) => (
                      <div key={record.id} className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 group transition-all">
                        <div>
                          <p className="text-sm font-semibold text-slate-200">{format(parseISO(record.date), 'dd MMM yyyy', { locale: es })}</p>
                          <p className="text-xs text-slate-500">{record.positions} posiciones</p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => handlePalletEdit(record)} className="p-2 text-slate-500 hover:text-amber-500"><Pencil size={16} /></button>
                          <button onClick={() => handlePalletDelete(record.id)} className="p-2 text-slate-500 hover:text-red-500"><Trash2 size={16} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="lg:col-span-2 space-y-6">
                <section className="bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-800">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-xl font-bold text-slate-200">Reporte Semanal</h2>
                      <p className="text-sm text-slate-500">Semana del {format(parseISO(currentWeekData.start), 'dd/MM')} al {format(parseISO(currentWeekData.end), 'dd/MM')}</p>
                    </div>
                    <button 
                      onClick={() => handleExportPalletExcel(currentWeekData.data, currentWeekData.start, currentWeekData.end)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold rounded-xl transition-all flex items-center gap-2"
                    >
                      <Download size={16} /> Excel
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
                    {currentWeekData.data.map((day, idx) => (
                      <div key={idx} className={cn(
                        "p-4 rounded-2xl border transition-all",
                        day.hasData ? "bg-slate-950 border-emerald-500/30" : "bg-slate-950/50 border-slate-800 opacity-50"
                      )}>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">{day.displayDate}</p>
                        <p className="text-lg font-mono font-bold text-slate-200">{day.positions} <span className="text-[10px] text-slate-500">pos</span></p>
                      </div>
                    ))}
                  </div>

                  <div className="h-[250px] w-full mb-8">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={currentWeekData.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis dataKey="displayDate" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }} />
                        <Line type="monotone" dataKey="positions" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981' }} activeDot={{ r: 8 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <button 
                    onClick={() => handleSavePalletReport(currentWeekData.data, currentWeekData.start, currentWeekData.end, currentWeekData.total, currentWeekData.avg)}
                    className="w-full py-3 bg-slate-100 hover:bg-white text-slate-950 font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Save size={18} />
                    Guardar Reporte Semanal
                  </button>
                </section>

                <section className="bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-800">
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 mb-6">Historial Semanal Bianchi</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {palletReports.map((report) => (
                      <div key={report.id} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 group hover:border-emerald-500/30 transition-all">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-sm font-bold text-slate-200">{format(parseISO(report.week_start), 'dd/MM')} - {format(parseISO(report.week_end), 'dd/MM')}</p>
                          <button onClick={() => handleDeletePalletReport(report.id)} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
                        </div>
                        <div className="flex gap-4">
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase">Promedio</p>
                            <p className="text-sm font-mono text-emerald-500">{report.avg_positions.toFixed(1)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase">Total</p>
                            <p className="text-sm font-mono text-slate-300">{report.total_positions}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        ) : activeTab === 'cepas' ? (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold text-slate-200">Cepas</h2>
                <p className="text-slate-400">Control diario de posiciones y reporte mensual</p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="bg-slate-900 p-2 rounded-2xl border border-slate-800 shadow-xl flex items-center gap-3">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold ml-2">Ver Mes:</span>
                  <input 
                    type="month" 
                    value={cepasReportMonth}
                    onChange={(e) => setCepasReportMonth(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold block">Promedio Mensual</span>
                  <span className="text-xl font-mono font-bold text-emerald-500">{cepasMonthlyData.avg.toFixed(1)} pos</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 space-y-6">
                <section className="bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-800">
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
                    {isEditingCepas ? <Pencil size={16} className="text-amber-500" /> : <Plus size={16} />} 
                    {isEditingCepas ? 'Editar Registro' : 'Nuevo Registro Diario'}
                  </h2>
                  <form onSubmit={handleCepasSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1 ml-1">Fecha</label>
                      <input 
                        type="date" 
                        value={newCepasDate}
                        onChange={(e) => setNewCepasDate(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-200"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1 ml-1">Posiciones</label>
                      <input 
                        type="number" 
                        placeholder="0"
                        value={newCepasPositions}
                        onChange={(e) => setNewCepasPositions(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-slate-200"
                        required
                      />
                    </div>
                    <button 
                      type="submit"
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      <Save size={18} />
                      {isEditingCepas ? 'Actualizar' : 'Guardar'}
                    </button>
                  </form>
                </section>

                <section className="bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-800">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Últimos Registros Diarios</h2>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                    {cepasRecords.slice(0, 15).map((record) => (
                      <div key={record.id} className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 group transition-all">
                        <div>
                          <p className="text-sm font-semibold text-slate-200">{format(parseISO(record.date), 'dd MMM yyyy', { locale: es })}</p>
                          <p className="text-xs text-slate-500">{record.positions} posiciones</p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => handleCepasEdit(record)} className="p-2 text-slate-500 hover:text-amber-500"><Pencil size={16} /></button>
                          <button onClick={() => handleCepasDelete(record.id)} className="p-2 text-slate-500 hover:text-red-500"><Trash2 size={16} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="lg:col-span-2 space-y-6">
                <section className="bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-800">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-xl font-bold text-slate-200">Reporte Mensual Cepas</h2>
                      <p className="text-sm text-slate-500">Mes de {format(parseISO(`${cepasMonthlyData.month}-01`), 'MMMM yyyy', { locale: es })}</p>
                    </div>
                    <button 
                      onClick={() => handleExportCepasExcel(cepasMonthlyData.data, cepasMonthlyData.month)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold rounded-xl transition-all flex items-center gap-2"
                    >
                      <Download size={16} /> Excel
                    </button>
                  </div>

                  <div className="h-[300px] w-full mb-8">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={cepasMonthlyData.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis dataKey="displayDate" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }} />
                        <Line type="monotone" dataKey="positions" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981' }} activeDot={{ r: 8 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Días Registrados</p>
                      <p className="text-xl font-mono font-bold text-slate-200">{cepasMonthlyData.data.filter(d => d.hasData).length}</p>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleSaveCepasReport(cepasMonthlyData.data, cepasMonthlyData.month, cepasMonthlyData.total, cepasMonthlyData.avg)}
                    className="w-full py-3 bg-slate-100 hover:bg-white text-slate-950 font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Save size={18} />
                    Guardar Reporte Mensual
                  </button>
                </section>

                <section className="bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-800">
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 mb-6">Historial de Reportes Mensuales</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {cepasReports.map((report) => (
                      <div key={report.id} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 group hover:border-emerald-500/30 transition-all">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-sm font-bold text-slate-200">{format(parseISO(`${report.month}-01`), 'MMMM yyyy', { locale: es })}</p>
                          <button onClick={() => handleDeleteCepasReport(report.id)} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
                        </div>
                        <div className="flex gap-4">
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase">Promedio</p>
                            <p className="text-sm font-mono text-emerald-500">{report.avg_positions.toFixed(1)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        ) : activeTab === 'backup' ? (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold text-slate-200">Backup y Restauración</h2>
                <p className="text-slate-400">Gestiona la seguridad de tus datos almacenados</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <section className="bg-slate-900 rounded-3xl p-8 shadow-xl border border-slate-800 flex flex-col items-center text-center space-y-6">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500">
                  <Download size={40} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-200">Exportar Datos</h3>
                  <p className="text-slate-400 mt-2 text-sm">
                    Descarga una copia completa de todos los registros, reportes y configuraciones en un archivo JSON.
                  </p>
                </div>
                <button 
                  onClick={handleExportBackup}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-3"
                >
                  <Download size={20} />
                  Descargar Backup
                </button>
              </section>

              <section className="bg-slate-900 rounded-3xl p-8 shadow-xl border border-slate-800 flex flex-col items-center text-center space-y-6">
                <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500">
                  <Upload size={40} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-200">Restaurar Datos</h3>
                  <p className="text-slate-400 mt-2 text-sm">
                    Sube un archivo de backup previamente exportado para restaurar la información. 
                    <span className="text-amber-500 block mt-1 font-semibold">¡Atención! Esto puede duplicar registros si ya existen.</span>
                  </p>
                </div>
                <label className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-3 cursor-pointer">
                  <Upload size={20} />
                  Seleccionar Archivo
                  <input 
                    type="file" 
                    accept=".json" 
                    onChange={handleImportBackup} 
                    className="hidden" 
                  />
                </label>
              </section>
            </div>

            <div className="bg-slate-900/50 rounded-3xl p-8 border border-rose-900/20 space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500">
                  <Trash2 size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-100">Zona de Peligro</h2>
                  <p className="text-slate-400 text-sm">Acciones destructivas e irreversibles</p>
                </div>
              </div>
              <p className="text-slate-500 text-sm leading-relaxed">
                Elimina todos los datos de la aplicación. Esta acción borrará permanentemente todos los registros diarios y reportes guardados en el servidor.
              </p>
              <button 
                onClick={() => setShowClearConfirm(true)}
                className="w-full py-4 bg-rose-600/10 hover:bg-rose-600/20 text-rose-500 border border-rose-500/20 font-bold rounded-2xl transition-all flex items-center justify-center gap-2"
              >
                <Trash2 size={20} />
                Eliminar Todos los Datos
              </button>
            </div>

            <div className="bg-slate-900/50 rounded-3xl p-6 border border-slate-800/50">
              <h4 className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mb-4">Información del Sistema</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <div>
                  <p className="text-slate-500 text-xs">Registros Kilos</p>
                  <p className="text-xl font-mono font-bold text-slate-300">{records.length}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Reportes Kilos</p>
                  <p className="text-xl font-mono font-bold text-slate-300">{savedReports.length}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Registros Bianchi</p>
                  <p className="text-xl font-mono font-bold text-slate-300">{palletRecords.length}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Registros Cepas</p>
                  <p className="text-xl font-mono font-bold text-slate-300">{cepasRecords.length}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-slate-500">Selecciona una pestaña para ver el contenido</p>
          </div>
        )}
      </div>

      <footer className="mt-12 pt-8 border-t border-slate-800 text-center text-slate-500 text-sm pb-12">
        <p>© {new Date().getFullYear()} Control de kilos almacenados</p>
        <div className="mt-4 p-3 bg-slate-900/50 rounded-xl inline-block border border-slate-800">
          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-600 mb-1">Estado de Sincronización</p>
          <div className="flex items-center justify-center gap-4 font-mono text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Firestore Conectado
            </span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1.5">
              <Package size={12} className="text-slate-600" />
              Registros: {records.length}
            </span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1.5">
              <TrendingUp size={12} className="text-slate-600" />
              Real-time
            </span>
            <span className="text-slate-700">|</span>
            <span>Actualizado: {new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      </footer>
      
      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            onAnimationComplete={() => {
              setTimeout(() => setNotification(null), 3000);
            }}
            className={cn(
              "fixed bottom-8 left-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border min-w-[300px]",
              notification.type === 'success' ? "bg-emerald-900/90 border-emerald-500/50 text-emerald-100" :
              notification.type === 'error' ? "bg-rose-900/90 border-rose-500/50 text-rose-100" :
              "bg-slate-800/90 border-slate-600/50 text-slate-100"
            )}
          >
            {notification.type === 'success' ? <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> :
             notification.type === 'error' ? <div className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" /> :
             <div className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" />}
            <p className="text-sm font-medium">{notification.message}</p>
            <button onClick={() => setNotification(null)} className="ml-auto hover:bg-white/10 p-1 rounded-lg transition-colors">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generic Confirmation Modal */}
      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-slate-100">{confirmModal.title}</h3>
                <p className="text-slate-400 text-sm">{confirmModal.message}</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => {
                    if (confirmModal.onCancel) confirmModal.onCancel();
                    setConfirmModal(null);
                  }}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    confirmModal.onConfirm();
                    setConfirmModal(null);
                  }}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg shadow-rose-900/20 transition-all"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Clear All Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-slate-900 border border-rose-900/50 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center text-rose-500 mx-auto">
                <Trash2 size={32} />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-slate-100">¿Eliminar TODOS los datos?</h3>
                <p className="text-slate-400 text-sm">
                  Esta acción es irreversible. Se eliminarán todos los registros diarios, reportes guardados y configuraciones de todas las secciones.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={clearAllData}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg shadow-rose-900/20 transition-all"
                >
                  Eliminar Todo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Restore Confirmation Modal */}
      <AnimatePresence>
        {showRestoreConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500 mx-auto">
                <Database size={32} />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-slate-100">¿Restaurar Backup?</h3>
                <p className="text-slate-400 text-sm">
                  Estás a punto de restaurar los datos desde un archivo. Esto intentará sincronizar todos los registros con el servidor.
                </p>
                <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800 text-left mt-4">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Resumen del archivo:</p>
                  <ul className="text-xs space-y-1 text-slate-300 font-mono">
                    <li>• Registros Kilos: {importData?.records?.length || 0}</li>
                    <li>• Registros Bianchi: {importData?.palletRecords?.length || 0}</li>
                    <li>• Registros Cepas: {importData?.cepasRecords?.length || 0}</li>
                  </ul>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => {
                    setShowRestoreConfirm(false);
                    setImportData(null);
                  }}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={executeRestore}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-900/20 transition-all"
                >
                  Confirmar Restauración
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Loading Overlay with Status */}
      <AnimatePresence>
        {loading && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 backdrop-blur-md">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-6 h-6 bg-emerald-500/20 rounded-full animate-pulse" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-emerald-500 font-bold tracking-widest text-xs uppercase animate-pulse">
                  {restoreStatus || 'Cargando...'}
                </p>
                {progress > 0 && (
                  <div className="w-48 h-1 bg-slate-800 rounded-full mt-3 overflow-hidden">
                    <motion.div 
                      className="h-full bg-emerald-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="month"]::-webkit-calendar-picker-indicator {
          filter: invert(1);
          cursor: pointer;
        }
      `}</style>
    </div>
    </ErrorBoundary>
  );
}
