import React, { useState, useEffect, useMemo } from 'react';
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
  Upload
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

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StockRecord {
  id: number;
  date: string;
  kilos: number;
  created_at: string;
}

interface SavedReport {
  id: number;
  month: string;
  period: string;
  total_kilos: number;
  avg_kilos: number;
  data_json: string;
  created_at: string;
}

interface PalletRecord {
  id: number;
  date: string;
  positions: number;
  created_at: string;
}

interface PalletReport {
  id: number;
  week_start: string;
  week_end: string;
  total_positions: number;
  avg_positions: number;
  data_json: string;
  created_at: string;
}

interface CepasRecord {
  id: number;
  date: string;
  positions: number;
  created_at: string;
}

interface CepasReport {
  id: number;
  month: string;
  total_positions: number;
  avg_positions: number;
  data_json: string;
  created_at: string;
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
  const [isEditingPallet, setIsEditingPallet] = useState(false);
  const [isEditingCepas, setIsEditingCepas] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'local' | 'syncing'>('synced');

  const fetchData = async () => {
    try {
      const [recordsRes, reportsRes, palletsRes, palletReportsRes, cepasRes, cepasReportsRes] = await Promise.all([
        fetch('/api/records'),
        fetch('/api/reports'),
        fetch('/api/pallets'),
        fetch('/api/pallet-reports'),
        fetch('/api/cepas'),
        fetch('/api/cepas-reports')
      ]);
      
      if (!recordsRes.ok || !reportsRes.ok || !palletsRes.ok || !palletReportsRes.ok || !cepasRes.ok || !cepasReportsRes.ok) throw new Error('Failed to fetch');
      
      let recordsData = await recordsRes.json();
      let reportsData = await reportsRes.json();
      let palletsData = await palletsRes.json();
      let palletReportsData = await palletReportsRes.json();
      let cepasData = await cepasRes.json();
      let cepasReportsData = await cepasReportsRes.json();
      
      // --- SYNC LOGIC ---
      if (recordsData.length === 0) {
        const localRecords = localStorage.getItem('stock_records_backup');
        if (localRecords) {
          const parsed = JSON.parse(localRecords);
          if (parsed.length > 0) {
            setSyncing(true);
            setSyncStatus('syncing');
            for (const rec of parsed) {
              await fetch('/api/records', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: rec.date, kilos: rec.kilos }),
              });
            }
            const r = await fetch('/api/records');
            recordsData = await r.json();
            setSyncing(false);
            setSyncStatus('synced');
          }
        }
      } else {
        safeSetItem('stock_records_backup', recordsData);
        setSyncStatus('synced');
      }

      if (reportsData.length === 0) {
        const localReports = localStorage.getItem('stock_reports_backup_v2');
        if (localReports) {
          const parsed = JSON.parse(localReports);
          if (parsed.length > 0) {
            setSyncing(true);
            setSyncStatus('syncing');
            for (const rep of parsed) {
              await fetch('/api/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rep),
              });
            }
            const r = await fetch('/api/reports');
            reportsData = await r.json();
            setSyncing(false);
            setSyncStatus('synced');
          }
        }
      } else {
        safeSetItem('stock_reports_backup_v2', reportsData);
      }

      // Sync Pallets
      if (palletsData.length === 0) {
        const localPallets = localStorage.getItem('pallet_records_backup');
        if (localPallets) {
          const parsed = JSON.parse(localPallets);
          if (parsed.length > 0) {
            for (const rec of parsed) {
              await fetch('/api/pallets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: rec.date, positions: rec.positions }),
              });
            }
            const r = await fetch('/api/pallets');
            palletsData = await r.json();
          }
        }
      } else {
        safeSetItem('pallet_records_backup', palletsData);
      }

      // Sync Pallet Reports
      if (palletReportsData.length === 0) {
        const localPalletReports = localStorage.getItem('pallet_reports_backup');
        if (localPalletReports) {
          const parsed = JSON.parse(localPalletReports);
          if (parsed.length > 0) {
            for (const rep of parsed) {
              await fetch('/api/pallet-reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rep),
              });
            }
            const r = await fetch('/api/pallet-reports');
            palletReportsData = await r.json();
          }
        }
      } else {
        safeSetItem('pallet_reports_backup', palletReportsData);
      }

      // Sync Cepas
      if (cepasData.length === 0) {
        const localCepas = localStorage.getItem('cepas_records_backup');
        if (localCepas) {
          const parsed = JSON.parse(localCepas);
          if (parsed.length > 0) {
            for (const rec of parsed) {
              await fetch('/api/cepas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: rec.date, positions: rec.positions }),
              });
            }
            const r = await fetch('/api/cepas');
            cepasData = await r.json();
          }
        }
      } else {
        safeSetItem('cepas_records_backup', cepasData);
      }

      // Sync Cepas Reports
      if (cepasReportsData.length === 0) {
        const localCepasReports = localStorage.getItem('cepas_reports_backup');
        if (localCepasReports) {
          const parsed = JSON.parse(localCepasReports);
          if (parsed.length > 0) {
            for (const rep of parsed) {
              await fetch('/api/cepas-reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rep),
              });
            }
            const r = await fetch('/api/cepas-reports');
            cepasReportsData = await r.json();
          }
        }
      } else {
        safeSetItem('cepas_reports_backup', cepasReportsData);
      }
      // --- END SYNC LOGIC ---

      setRecords(recordsData);
      setSavedReports(reportsData);
      setPalletRecords(palletsData);
      setPalletReports(palletReportsData);
      setCepasRecords(cepasData);
      setCepasReports(cepasReportsData);
    } catch (error) {
      console.error('Error fetching data:', error);
      setSyncStatus('local');
      const localRecords = localStorage.getItem('stock_records_backup');
      const localReports = localStorage.getItem('stock_reports_backup_v2');
      const localPallets = localStorage.getItem('pallet_records_backup');
      const localPalletReports = localStorage.getItem('pallet_reports_backup');
      const localCepas = localStorage.getItem('cepas_records_backup');
      const localCepasReports = localStorage.getItem('cepas_reports_backup');

      if (localRecords) setRecords(JSON.parse(localRecords));
      if (localReports) setSavedReports(JSON.parse(localReports));
      if (localPallets) setPalletRecords(JSON.parse(localPallets));
      if (localPalletReports) setPalletReports(JSON.parse(localPalletReports));
      if (localCepas) setCepasRecords(JSON.parse(localCepas));
      if (localCepasReports) setCepasReports(JSON.parse(localCepasReports));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Sync every 30s
    
    const timer = setTimeout(() => {
      setMinLoadingTimePassed(true);
    }, 3000);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
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
    if (!newDate || !newKilos) return;

    try {
      const kilosNum = parseFloat(newKilos);
      if (isNaN(kilosNum)) {
        alert('Por favor ingrese un número válido para los kilos.');
        return;
      }

      const response = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate, kilos: kilosNum }),
      });

      if (response.ok) {
        setNewKilos('');
        setIsEditing(false);
        // Optimistic local update
        const updatedRecords = [...records.filter(r => r.date !== newDate), { date: newDate, kilos: kilosNum, id: Date.now(), created_at: new Date().toISOString() }];
        localStorage.setItem('stock_records_backup', JSON.stringify(updatedRecords));
        fetchData();
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.error || 'No se pudo guardar el registro'}`);
      }
    } catch (error) {
      console.error('Error saving record:', error);
      alert('Error de conexión al intentar guardar el registro.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este registro?')) return;
    try {
      const response = await fetch(`/api/records/${id}`, { method: 'DELETE' });
      if (response.ok) {
        if (isEditing) {
          setIsEditing(false);
          setNewKilos('');
        }
        fetchData();
      }
    } catch (error) {
      console.error('Error deleting record:', error);
    }
  };

  const handleEdit = (record: StockRecord) => {
    setNewDate(record.date);
    setNewKilos(record.kilos.toString());
    setIsEditing(true);
    // Scroll to top or form if needed, but the form is usually visible
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setNewKilos('');
    setNewDate(format(startOfToday(), 'yyyy-MM-dd'));
  };

  const handleSaveReport = async () => {
    if (reportData.filter(d => d.hasData).length === 0) {
      alert('No hay datos registrados en esta quincena para guardar.');
      return;
    }

    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: reportMonth,
          period: reportPeriod,
          total_kilos: totalKilos,
          avg_kilos: avgKilos,
          data_json: reportData
        }),
      });

      if (response.ok) {
        alert('¡Quincena guardada y almacenada en el historial con éxito!');
        fetchData();
        
        if (confirm('¿Deseas limpiar los registros diarios de esta quincena ahora que ha sido guardada? (Esto no borrará el informe del historial)')) {
          handleClearPeriodRecords();
        }
      }
    } catch (error) {
      console.error('Error saving report:', error);
    }
  };

  const handlePalletSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPalletDate || !newPositions) return;

    try {
      const posNum = parseInt(newPositions);
      if (isNaN(posNum)) {
        alert('Por favor ingrese un número válido para las posiciones.');
        return;
      }

      const response = await fetch('/api/pallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newPalletDate, positions: posNum }),
      });

      if (response.ok) {
        setNewPositions('');
        setIsEditingPallet(false);
        // Optimistic local update
        const updatedPallets = [...palletRecords.filter(r => r.date !== newPalletDate), { date: newPalletDate, positions: posNum, id: Date.now(), created_at: new Date().toISOString() }];
        safeSetItem('pallet_records_backup', updatedPallets);
        fetchData();
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.error || 'No se pudo guardar el registro'}`);
      }
    } catch (error) {
      console.error('Error saving pallet record:', error);
    }
  };

  const handlePalletDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este registro de posiciones?')) return;
    try {
      const response = await fetch(`/api/pallets/${id}`, { method: 'DELETE' });
      if (response.ok) fetchData();
    } catch (error) {
      console.error('Error deleting pallet record:', error);
    }
  };

  const handlePalletEdit = (record: PalletRecord) => {
    setNewPalletDate(record.date);
    setNewPositions(record.positions.toString());
    setIsEditingPallet(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCepasSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCepasDate || !newCepasPositions) return;

    try {
      const posNum = parseInt(newCepasPositions);
      if (isNaN(posNum)) {
        alert('Por favor ingrese un número válido para las posiciones.');
        return;
      }

      const response = await fetch('/api/cepas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newCepasDate, positions: posNum }),
      });

      if (response.ok) {
        setNewCepasPositions('');
        setIsEditingCepas(false);
        // Optimistic local update
        const updatedCepas = [...cepasRecords.filter(r => r.date !== newCepasDate), { date: newCepasDate, positions: posNum, id: Date.now(), created_at: new Date().toISOString() }];
        safeSetItem('cepas_records_backup', updatedCepas);
        fetchData();
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.error || 'No se pudo guardar el registro'}`);
      }
    } catch (error) {
      console.error('Error saving cepas record:', error);
    }
  };

  const handleCepasDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este registro de Cepas?')) return;
    try {
      const response = await fetch(`/api/cepas/${id}`, { method: 'DELETE' });
      if (response.ok) fetchData();
    } catch (error) {
      console.error('Error deleting cepas record:', error);
    }
  };

  const handleCepasEdit = (record: CepasRecord) => {
    setNewCepasDate(record.date);
    setNewCepasPositions(record.positions.toString());
    setIsEditingCepas(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveCepasReport = async (monthData: any[], month: string, total: number, avg: number) => {
    try {
      const response = await fetch('/api/cepas-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: month,
          total_positions: total,
          avg_positions: avg,
          data_json: monthData
        }),
      });

      if (response.ok) {
        alert('Reporte mensual guardado con éxito');
        fetchData();
      } else {
        alert('Error al guardar el reporte');
      }
    } catch (error) {
      console.error('Error saving cepas report:', error);
    }
  };

  const handleDeleteCepasReport = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este reporte mensual?')) return;
    try {
      const response = await fetch(`/api/cepas-reports/${id}`, { method: 'DELETE' });
      if (response.ok) fetchData();
    } catch (error) {
      console.error('Error deleting cepas report:', error);
    }
  };

  const handleSavePalletReport = async (weekData: any[], start: string, end: string, total: number, avg: number) => {
    try {
      const response = await fetch('/api/pallet-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start: start,
          week_end: end,
          total_positions: total,
          avg_positions: avg,
          data_json: weekData
        }),
      });

      if (response.ok) {
        alert('Reporte semanal de Bodegas Bianchi guardado con éxito.');
        fetchData();
      }
    } catch (error) {
      console.error('Error saving pallet report:', error);
    }
  };

  const handleDeletePalletReport = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este reporte semanal?')) return;
    try {
      const response = await fetch(`/api/pallet-reports/${id}`, { method: 'DELETE' });
      if (response.ok) fetchData();
    } catch (error) {
      console.error('Error deleting pallet report:', error);
    }
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

    try {
      await Promise.all(idsToDelete.map(id => 
        fetch(`/api/records/${id}`, { method: 'DELETE' })
      ));
      fetchData();
    } catch (error) {
      console.error('Error clearing period records:', error);
    }
  };

  const handleDeleteReport = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este informe guardado?')) return;
    try {
      const response = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
      if (response.ok) fetchData();
    } catch (error) {
      console.error('Error deleting report:', error);
    }
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

  const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        
        if (!data.records || !data.version) {
          throw new Error('Formato de backup inválido');
        }

        if (confirm('¿Estás seguro de que deseas restaurar este backup? Esto intentará sincronizar los datos con el servidor.')) {
          setLoading(true);
          setProgress(10);

          // Helper to sync data
          const syncEntity = async (endpoint: string, items: any[]) => {
            for (const item of items) {
              await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
              });
            }
          };

          try {
            // This is a naive implementation that might create duplicates if not handled by backend
            // But it's better than nothing for a backup/restore feature.
            // Ideally the backend would have a "bulk import" or "clear and import".
            
            if (data.records) await syncEntity('/api/records', data.records);
            setProgress(30);
            if (data.savedReports) await syncEntity('/api/reports', data.savedReports);
            setProgress(50);
            if (data.palletRecords) await syncEntity('/api/pallets', data.palletRecords);
            setProgress(70);
            if (data.palletReports) await syncEntity('/api/pallet-reports', data.palletReports);
            setProgress(85);
            if (data.cepasRecords) await syncEntity('/api/cepas', data.cepasRecords);
            setProgress(95);
            if (data.cepasReports) await syncEntity('/api/cepas-reports', data.cepasReports);
            
            await fetchData();
            alert('Backup restaurado con éxito.');
          } catch (err) {
            console.error('Error during restore sync:', err);
            alert('Error al sincronizar los datos restaurados.');
          } finally {
            setLoading(false);
          }
        }
      } catch (err) {
        alert('Error al importar el backup. Asegúrate de que el archivo sea válido.');
      }
    };
    reader.readAsText(file);
    // Reset input
    event.target.value = '';
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
              <span className={cn(
                "w-2 h-2 rounded-full",
                syncStatus === 'synced' ? "bg-emerald-500" : 
                syncStatus === 'syncing' ? "bg-amber-500 animate-pulse" : "bg-red-500"
              )}></span>
              {syncStatus === 'synced' ? 'Sincronizado' : 
               syncStatus === 'syncing' ? 'Sincronizando...' : 'Modo Local (Backup)'}
            </span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1.5">
              <Package size={12} className="text-slate-600" />
              Registros: {records.length}
            </span>
            <span className="text-slate-700">|</span>
            <button 
              onClick={() => fetchData()}
              disabled={syncing}
              className="hover:text-emerald-400 transition-colors flex items-center gap-1"
            >
              <TrendingUp size={12} className={cn(syncing && "animate-spin")} />
              Sincronizar ahora
            </button>
            <span className="text-slate-700">|</span>
            <span>Actualizado: {new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      </footer>
      
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
  );
}
