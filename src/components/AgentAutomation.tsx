import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Bot, 
  Play, 
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  Clock, 
  Mail, 
  Download, 
  FileSpreadsheet, 
  FileJson, 
  Calendar, 
  Settings, 
  History, 
  Power, 
  Sparkles, 
  AlertCircle, 
  X, 
  Send, 
  Copy, 
  Check, 
  RefreshCw, 
  Layers, 
  Truck, 
  Warehouse, 
  Package, 
  Scale, 
  TrendingUp, 
  BellRing,
  Eye,
  ExternalLink,
  Server,
  Zap,
  ShieldCheck,
  Lock,
  MailCheck,
  HelpCircle,
  Info
} from 'lucide-react';
import { 
  collection, 
  doc, 
  getDoc,
  setDoc, 
  deleteDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  AgentSchedule, 
  AgentLog, 
  AgentFileType, 
  AgentFrequency, 
  AgentDatePreset 
} from '../types';
import { 
  AppDatasets, 
  generateAgentFile, 
  triggerBrowserDownload, 
  triggerMailto, 
  openOutlookWeb,
  generateAndComposeEmail,
  playSuccessChime, 
  getDefaultEmailBodyForType,
  GeneratedFileResult 
} from '../utils/fileGenerators';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface AgentAutomationProps {
  datasets: AppDatasets;
  onShowNotification: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const FILE_TYPE_OPTIONS: { id: AgentFileType; name: string; desc: string; format: 'xlsx' | 'json'; icon: any; color: string }[] = [
  { 
    id: 'abastecimientos', 
    name: 'Abastecimientos & Pallets', 
    desc: 'Movimientos, remitos y stock desglosado (Arlog, Descartables, Rotos)', 
    format: 'xlsx', 
    icon: Truck, 
    color: 'emerald' 
  },
  { 
    id: 'kilos', 
    name: 'Stock Kilos Raizen', 
    desc: 'Informe de kilos almacenados por día y promedios', 
    format: 'xlsx', 
    icon: Scale, 
    color: 'blue' 
  },
  { 
    id: 'bianchi', 
    name: 'Bodegas Bianchi', 
    desc: 'Posiciones de pallets y reporte quincenal/semanal', 
    format: 'xlsx', 
    icon: Package, 
    color: 'purple' 
  },
  { 
    id: 'cepas', 
    name: 'Cepas', 
    desc: 'Registro y evolución mensual de posiciones', 
    format: 'xlsx', 
    icon: TrendingUp, 
    color: 'teal' 
  },
  { 
    id: 'escorihuela', 
    name: 'Escorihuela Gascón', 
    desc: 'Posiciones diarias de bodega Escorihuela Gascón', 
    format: 'xlsx', 
    icon: Warehouse, 
    color: 'amber' 
  },
  { 
    id: 'la_rural', 
    name: 'La Rural (Rutini Wines)', 
    desc: 'Posiciones diarias de bodega La Rural', 
    format: 'xlsx', 
    icon: Warehouse, 
    color: 'rose' 
  },
  { 
    id: 'consolidado', 
    name: 'Consolidado Multibodega', 
    desc: 'Libro Excel integral con todas las bodegas, stock y movimientos', 
    format: 'xlsx', 
    icon: Layers, 
    color: 'indigo' 
  },
  { 
    id: 'backup', 
    name: 'Backup Integral de Datos', 
    desc: 'Copia completa de seguridad en formato JSON estructurado', 
    format: 'json', 
    icon: FileJson, 
    color: 'slate' 
  }
];

const DAYS_OF_WEEK = [
  { id: 1, label: 'L', name: 'Lunes' },
  { id: 2, label: 'M', name: 'Martes' },
  { id: 3, label: 'M', name: 'Miércoles' },
  { id: 4, label: 'J', name: 'Jueves' },
  { id: 5, label: 'V', name: 'Viernes' },
  { id: 6, label: 'S', name: 'Sábado' },
  { id: 0, label: 'D', name: 'Domingo' }
];

export const AgentAutomation: React.FC<AgentAutomationProps> = ({ datasets, onShowNotification }) => {
  const [agents, setAgents] = useState<AgentSchedule[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'agents' | 'logs' | 'smtp_server'>('agents');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Server & SMTP Status
  const [serverStatus, setServerStatus] = useState<{
    status: string;
    mode: string;
    currentTimeArgentina: string;
    smtpConfigured: boolean;
    smtpHost: string | null;
    smtpUser: string | null;
  } | null>(null);

  const [smtpForm, setSmtpForm] = useState<{
    host: string;
    port: number | string;
    secure: boolean;
    user: string;
    pass: string;
    fromName: string;
    fromEmail: string;
    hasPassword: boolean;
  }>({
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    fromName: 'Calico S.A. Automatizaciones',
    fromEmail: '',
    hasPassword: false
  });

  const isSmtpDirtyRef = useRef(false);
  const [testEmailTo, setTestEmailTo] = useState('hugofsir@gmail.com');
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [isSavingSmtp, setIsSavingSmtp] = useState(false);
  const [isExecutingServerAgent, setIsExecutingServerAgent] = useState<string | null>(null);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message: string } | null>(null);

  // Helper for safe API calls (prevents unexpected HTML parse errors)
  const safeApiCall = async (url: string, options?: RequestInit): Promise<{ ok: boolean; status: number; data?: any; error?: string }> => {
    try {
      const res = await fetch(url, options);
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        return { ok: res.ok, status: res.status, data, error: data?.error };
      }
      const text = await res.text();
      return { 
        ok: false, 
        status: res.status, 
        error: res.status === 404 
          ? 'Servicio API no disponible en este momento.' 
          : (text.slice(0, 100) || 'Respuesta no válida del servidor.') 
      };
    } catch (err: any) {
      return { ok: false, status: 0, error: err.message || 'Error de red' };
    }
  };

  // Fetch Server status ONLY (polling safe - never touches user input form)
  const fetchServerStatus = async () => {
    const res = await safeApiCall('/api/agent/server-status');
    if (res.ok && res.data) {
      setServerStatus(res.data);
    }
  };

  // Load SMTP config only once or when requested (will NOT overwrite if user is typing)
  const loadSMTPConfig = async (force = false) => {
    if (!force && isSmtpDirtyRef.current) return;
    
    // 1. Try reading directly from Firestore first (Instant & 100% reliable)
    try {
      const docRef = doc(db, 'system_settings', 'smtp_config');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (!force && isSmtpDirtyRef.current) return;
        setSmtpForm({
          host: data.host || '',
          port: data.port || 587,
          secure: data.secure || false,
          user: data.user || '',
          pass: '',
          fromName: data.fromName || 'Calico S.A. Automatizaciones',
          fromEmail: data.fromEmail || '',
          hasPassword: !!(data.pass || data.hasPassword)
        });
      }
    } catch (e) {
      console.warn('Firestore read smtp_config:', e);
    }

    // 2. Also try API endpoint to check server environment variables
    const apiRes = await safeApiCall('/api/smtp/config');
    if (apiRes.ok && apiRes.data) {
      const data = apiRes.data;
      setSmtpForm(prev => {
        if (!force && isSmtpDirtyRef.current) return prev;
        return {
          host: data.host || prev.host || '',
          port: data.port || prev.port || 587,
          secure: data.secure ?? prev.secure,
          user: data.user || prev.user || '',
          pass: '',
          fromName: data.fromName || prev.fromName || 'Calico S.A. Automatizaciones',
          fromEmail: data.fromEmail || prev.fromEmail || '',
          hasPassword: !!(data.hasPassword || prev.hasPassword)
        };
      });
    }
  };

  useEffect(() => {
    fetchServerStatus();
    loadSMTPConfig(true);

    const interval = setInterval(fetchServerStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Form State
  const [formName, setFormName] = useState('');
  const [formFileType, setFormFileType] = useState<AgentFileType>('abastecimientos');
  const [formDatePreset, setFormDatePreset] = useState<AgentDatePreset>('all');
  const [formFrequency, setFormFrequency] = useState<AgentFrequency>('monthly');
  const [formMonthlyMode, setFormMonthlyMode] = useState<'last_day' | 'specific_day'>('last_day');
  const [formDaysOfWeek, setFormDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [formDayOfMonth, setFormDayOfMonth] = useState<number>(31);
  const [formTime, setFormTime] = useState<string>('08:00');
  const [formRecipients, setFormRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState<string>('');
  const [formSubject, setFormSubject] = useState<string>('');
  const [formBody, setFormBody] = useState<string>('');
  const [formAutoDownload, setFormAutoDownload] = useState<boolean>(true);
  const [formStatus, setFormStatus] = useState<'active' | 'paused'>('active');

  // Execution Result Modal State
  const [executionResult, setExecutionResult] = useState<{
    agent: AgentSchedule;
    fileResult: GeneratedFileResult;
    triggerType: 'scheduled' | 'manual';
  } | null>(null);

  const [copiedField, setCopiedField] = useState<'subject' | 'recipients' | 'body' | 'all' | null>(null);
  const [isExecutingNow, setIsExecutingNow] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>(format(new Date(), 'HH:mm:ss'));
  const [currentDateStr, setCurrentDateStr] = useState<string>(format(new Date(), 'EEEE, d MMMM yyyy', { locale: es }));
  const [hasNotificationPermission, setHasNotificationPermission] = useState<boolean>(
    typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
  );

  // Request browser notification permission
  const handleRequestNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          setHasNotificationPermission(true);
          onShowNotification('Notificaciones de escritorio activadas para alertas de reportes.', 'success');
        } else {
          setHasNotificationPermission(false);
          onShowNotification('Permiso de notificaciones no concedido.', 'info');
        }
      } catch (e) {
        console.warn('Error requesting notification permission:', e);
      }
    }
  };

  // Copy text helper with individual field feedback
  const handleCopyField = async (text: string, field: 'subject' | 'recipients' | 'body' | 'all', label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      onShowNotification(`${label} copiado al portapapeles.`, 'success');
      setTimeout(() => setCopiedField(null), 2500);
    } catch (err) {
      console.error('Error copying text:', err);
    }
  };

  // Ref to track last checked minute for scheduler
  const lastCheckedMinuteRef = useRef<string>('');

  // 1. Subscribe to Firestore Collections
  useEffect(() => {
    const qAgents = query(collection(db, 'agents'), orderBy('created_at', 'desc'));
    const qLogs = query(collection(db, 'agent_logs'), orderBy('executed_at', 'desc'));

    const unsubAgents = onSnapshot(qAgents, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as AgentSchedule));
      setAgents(items);
    }, (error) => {
      console.error('Error fetching agents:', error);
    });

    const unsubLogs = onSnapshot(qLogs, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as AgentLog));
      setLogs(items);
    }, (error) => {
      console.error('Error fetching logs:', error);
    });

    return () => {
      unsubAgents();
      unsubLogs();
    };
  }, []);

  // 2. Realtime Background Scheduler Tick (runs every second / minute)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(format(now, 'HH:mm:ss'));
      setCurrentDateStr(format(now, 'EEEE, d MMMM yyyy', { locale: es }));

      const currentMinuteStr = format(now, 'yyyy-MM-dd_HH:mm');
      const currentDayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday...
      const currentDayOfMonth = now.getDate();
      const currentTimeHM = format(now, 'HH:mm');

      // Calculate the exact last day of the current month (28, 29, 30, or 31)
      const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const isLastDayOfMonth = currentDayOfMonth === totalDaysInMonth;

      // Check if we haven't already checked this minute
      if (lastCheckedMinuteRef.current !== currentMinuteStr) {
        lastCheckedMinuteRef.current = currentMinuteStr;

        // Check all active agents
        agents.forEach((agent) => {
          if (agent.status !== 'active') return;

          let shouldRun = false;

          if (agent.time === currentTimeHM) {
            switch (agent.frequency) {
              case 'daily':
                shouldRun = true;
                break;
              case 'weekdays':
                shouldRun = currentDayOfWeek >= 1 && currentDayOfWeek <= 5;
                break;
              case 'weekly': {
                const targetDay = (agent.days_of_week && agent.days_of_week.length > 0) ? agent.days_of_week[0] : 1;
                shouldRun = currentDayOfWeek === targetDay;
                break;
              }
              case 'custom_days':
                shouldRun = !!agent.days_of_week?.includes(currentDayOfWeek);
                break;
              case 'fortnightly':
                // Quincenal: Días 1 y 16, o día 1 y último día del mes
                shouldRun = currentDayOfMonth === 1 || currentDayOfMonth === 16 || isLastDayOfMonth;
                break;
              case 'monthly_last_day':
                // Always on the last calendar day of the month (28, 29, 30 or 31)
                shouldRun = isLastDayOfMonth;
                break;
              case 'monthly': {
                const isConfiguredForLastDay = 
                  agent.monthly_mode === 'last_day' || 
                  agent.day_of_month === 'last_day' || 
                  agent.day_of_month === -1 || 
                  agent.day_of_month === 31 ||
                  !agent.day_of_month;

                if (isConfiguredForLastDay) {
                  // Must trigger on the last day regardless of 30, 31, 28 or 29 days
                  shouldRun = isLastDayOfMonth;
                } else {
                  const targetDayNum = Number(agent.day_of_month);
                  // If the current month has fewer days than targetDay (e.g. target is 31 in April, or 29/30 in Feb):
                  // Execute on the last day of the month so it's never missed!
                  if (targetDayNum >= totalDaysInMonth) {
                    shouldRun = isLastDayOfMonth;
                  } else {
                    shouldRun = currentDayOfMonth === targetDayNum;
                  }
                }
                break;
              }
            }
          }

          const todayDateKey = format(now, 'yyyy-MM-dd');
          if (shouldRun && agent.last_run_date !== todayDateKey) {
            handleTriggerAgentWithAlert(agent, 'scheduled');
          }
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [agents, datasets]);

  // Trigger Agent Alert and Download (both for scheduled tick and manual action)
  const handleTriggerAgentWithAlert = async (agent: AgentSchedule, triggerType: 'scheduled' | 'manual' = 'manual') => {
    setIsExecutingNow(agent.id);
    try {
      const fileResult = generateAgentFile(agent, datasets);

      // 1. Download file automatically to user's computer
      triggerBrowserDownload(fileResult.blob, fileResult.fileName);

      // 2. Play audio alert chime
      playSuccessChime();

      // 3. Trigger Browser desktop notification if supported and granted
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(`🔔 ¡Alerta de Envío: ${agent.name}!`, {
            body: `El archivo ${fileResult.fileName} se descargó automáticamente. Abre la alerta para enviar por Outlook.`,
            icon: '/favicon.ico'
          });
        } catch (e) {
          console.warn('Desktop notification error:', e);
        }
      }

      // 4. Show execution alert pop-up modal
      setExecutionResult({
        agent,
        fileResult,
        triggerType
      });

      const now = new Date();
      const executedAt = format(now, 'yyyy-MM-dd HH:mm:ss');
      const todayDateKey = format(now, 'yyyy-MM-dd');

      // Update agent last run in Firestore
      await updateDoc(doc(db, 'agents', agent.id), {
        last_run_at: executedAt,
        last_run_date: todayDateKey
      });

      // Write log to Firestore
      const logRef = doc(collection(db, 'agent_logs'));
      await setDoc(logRef, {
        agent_id: agent.id,
        agent_name: agent.name,
        file_type: agent.file_type,
        file_name: fileResult.fileName,
        recipients: agent.recipients,
        executed_at: executedAt,
        trigger_type: triggerType,
        status: 'success',
        details: fileResult.summaryText,
        created_at: serverTimestamp()
      });

      onShowNotification(
        triggerType === 'scheduled' 
          ? `🔔 ¡Alerta Programada!: "${agent.name}" descargó "${fileResult.fileName}" y activó la alerta de envío.` 
          : `Alerta generada y archivo "${fileResult.fileName}" descargado con éxito.`,
        'success'
      );
    } catch (err) {
      console.error('Error triggering agent alert:', err);
      onShowNotification(`Error al generar el reporte para "${agent.name}"`, 'error');
    } finally {
      setIsExecutingNow(null);
    }
  };

  // Quick download only (without opening alert modal)
  const handleQuickDownloadOnly = (agent: AgentSchedule) => {
    try {
      const fileResult = generateAgentFile(agent, datasets);
      triggerBrowserDownload(fileResult.blob, fileResult.fileName);
      playSuccessChime();
      onShowNotification(`Archivo "${fileResult.fileName}" descargado en tu equipo.`, 'success');
    } catch (err) {
      console.error('Error downloading file:', err);
      onShowNotification(`Error al descargar el archivo de "${agent.name}"`, 'error');
    }
  };

  // Backwards compatible alias
  const executeAgentTask = (agent: AgentSchedule, triggerType: 'scheduled' | 'manual') => {
    return handleTriggerAgentWithAlert(agent, triggerType);
  };

  // Open Form for New Agent
  const handleOpenNewModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormName('');
    setFormFileType('bianchi');
    setFormDatePreset('all');
    setFormFrequency('weekly');
    setFormMonthlyMode('last_day');
    setFormDaysOfWeek([1]);
    setFormDayOfMonth(31);
    setFormTime('08:00');
    setFormRecipients([]);
    setRecipientInput('');
    setFormSubject('');
    setFormBody(getDefaultEmailBodyForType('bianchi'));
    setFormAutoDownload(true);
    setFormStatus('active');
    setIsModalOpen(true);
  };

  // Open Form for Edit
  const handleOpenEditModal = (agent: AgentSchedule) => {
    setIsEditing(true);
    setEditingId(agent.id);
    setFormName(agent.name);
    setFormFileType(agent.file_type);
    setFormDatePreset(agent.date_range_preset);
    setFormFrequency(agent.frequency === 'monthly_last_day' ? 'monthly' : agent.frequency);
    
    // Check if configured for last day of month
    if (
      agent.frequency === 'monthly_last_day' || 
      agent.monthly_mode === 'last_day' || 
      agent.day_of_month === 'last_day' || 
      agent.day_of_month === 31 ||
      (agent.frequency === 'monthly' && !agent.day_of_month)
    ) {
      setFormMonthlyMode('last_day');
      setFormDayOfMonth(31);
    } else {
      setFormMonthlyMode(agent.monthly_mode || 'specific_day');
      setFormDayOfMonth(typeof agent.day_of_month === 'number' ? agent.day_of_month : 1);
    }

    setFormDaysOfWeek(agent.days_of_week || [1, 2, 3, 4, 5]);
    setFormTime(agent.time);
    setFormRecipients(agent.recipients || []);
    setRecipientInput('');
    setFormSubject(agent.email_subject || '');
    setFormBody(agent.email_body || getDefaultEmailBodyForType(agent.file_type));
    setFormAutoDownload(agent.auto_download);
    setFormStatus(agent.status);
    setIsModalOpen(true);
  };

  // Add Recipient Chip
  const handleAddRecipient = () => {
    const email = recipientInput.trim().toLowerCase();
    if (!email) return;

    // Basic email format check
    if (!email.includes('@') || !email.includes('.')) {
      onShowNotification('Ingrese una dirección de correo válida', 'error');
      return;
    }

    if (formRecipients.includes(email)) {
      onShowNotification('El destinatario ya fue agregado', 'info');
      return;
    }

    setFormRecipients([...formRecipients, email]);
    setRecipientInput('');
  };

  // Remove Recipient Chip
  const handleRemoveRecipient = (emailToRemove: string) => {
    setFormRecipients(formRecipients.filter(e => e !== emailToRemove));
  };

  // Save Agent Form
  const handleSaveAgent = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formName.trim()) {
      onShowNotification('Ingrese un nombre para el agente', 'error');
      return;
    }

    if (!formTime) {
      onShowNotification('Seleccione la hora de ejecución', 'error');
      return;
    }

    if (formRecipients.length === 0 && recipientInput.trim()) {
      handleAddRecipient();
    }

    try {
      const selectedTypeInfo = FILE_TYPE_OPTIONS.find(o => o.id === formFileType);
      const isLastDay = formFrequency === 'monthly_last_day' || (formFrequency === 'monthly' && formMonthlyMode === 'last_day');

      const agentData: Partial<AgentSchedule> = {
        name: formName.trim(),
        file_type: formFileType,
        file_format: selectedTypeInfo?.format || 'xlsx',
        date_range_preset: formDatePreset,
        frequency: formFrequency,
        monthly_mode: formFrequency === 'monthly' ? formMonthlyMode : undefined,
        day_of_month: formFrequency === 'monthly' ? (isLastDay ? 'last_day' : formDayOfMonth) : undefined,
        days_of_week: formDaysOfWeek,
        time: formTime,
        recipients: formRecipients.length > 0 ? formRecipients : (recipientInput.trim() ? [recipientInput.trim().toLowerCase()] : []),
        email_subject: formSubject.trim(),
        email_body: formBody.trim(),
        auto_download: formAutoDownload,
        status: formStatus
      };

      if (isEditing && editingId) {
        await updateDoc(doc(db, 'agents', editingId), agentData);
        onShowNotification('Agente actualizado con éxito', 'success');
      } else {
        const newDocRef = doc(collection(db, 'agents'));
        await setDoc(newDocRef, {
          ...agentData,
          created_at: serverTimestamp(),
          last_run_at: null,
          last_run_date: null
        });
        onShowNotification('Agente programado creado con éxito', 'success');
      }

      setIsModalOpen(false);
    } catch (err) {
      console.error('Error saving agent:', err);
      onShowNotification('Error al guardar la configuración del agente', 'error');
    }
  };

  // Toggle Agent Status
  const handleToggleStatus = async (agent: AgentSchedule) => {
    try {
      const newStatus = agent.status === 'active' ? 'paused' : 'active';
      await updateDoc(doc(db, 'agents', agent.id), { status: newStatus });
      onShowNotification(
        `Agente "${agent.name}" ${newStatus === 'active' ? 'activado' : 'pausado'}`,
        'info'
      );
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  // Delete Agent
  const handleDeleteAgent = async (agentId: string, agentName: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar el agente "${agentName}"?`)) return;
    try {
      await deleteDoc(doc(db, 'agents', agentId));
      onShowNotification(`Agente "${agentName}" eliminado`, 'success');
    } catch (err) {
      console.error('Error deleting agent:', err);
    }
  };

  // Clear Logs
  const handleClearLogs = async () => {
    if (!window.confirm('¿Deseas limpiar todo el historial de ejecuciones?')) return;
    try {
      for (const log of logs) {
        await deleteDoc(doc(db, 'agent_logs', log.id));
      }
      onShowNotification('Historial de ejecuciones limpiado', 'success');
    } catch (err) {
      console.error('Error clearing logs:', err);
    }
  };

  // Toggle Day of Week in Form
  const handleToggleDay = (dayId: number) => {
    if (formDaysOfWeek.includes(dayId)) {
      if (formDaysOfWeek.length === 1) return; // Keep at least one
      setFormDaysOfWeek(formDaysOfWeek.filter(d => d !== dayId));
    } else {
      setFormDaysOfWeek([...formDaysOfWeek, dayId].sort());
    }
  };

  // Copy Summary text
  const handleCopySummary = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField('body');
    onShowNotification('Texto copiado al portapapeles.', 'success');
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Save SMTP Settings (Saves to both Firestore cloud database and Node server)
  const handleSaveSMTPConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smtpForm.host || !smtpForm.user) {
      onShowNotification('Ingrese al menos el Servidor Host y Usuario SMTP', 'error');
      return;
    }

    setIsSavingSmtp(true);
    try {
      const portNum = parseInt(String(smtpForm.port)) || 587;

      // 1. Direct cloud persistence in Firestore
      try {
        const docRef = doc(db, 'system_settings', 'smtp_config');
        const snap = await getDoc(docRef);
        const existingData = snap.exists() ? snap.data() : {};
        const finalPass = smtpForm.pass && smtpForm.pass !== '••••••••••••••••' 
          ? smtpForm.pass.trim() 
          : (existingData.pass || '');

        await setDoc(docRef, {
          host: smtpForm.host.trim(),
          port: portNum,
          secure: !!smtpForm.secure,
          user: smtpForm.user.trim(),
          pass: finalPass,
          fromName: (smtpForm.fromName || 'Calico S.A. Automatizaciones').trim(),
          fromEmail: (smtpForm.fromEmail || smtpForm.user).trim(),
          is_active: true,
          updated_at: new Date().toISOString()
        }, { merge: true });
      } catch (fsErr) {
        console.warn('Error guardando en Firestore directo:', fsErr);
      }

      // 2. Notify the running Node server API
      const payload = {
        ...smtpForm,
        port: portNum
      };

      const res = await safeApiCall('/api/smtp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      isSmtpDirtyRef.current = false;
      setSmtpForm(prev => ({
        ...prev,
        pass: '',
        hasPassword: true
      }));

      // Immediate local state update for instant visual feedback
      setServerStatus(prev => ({
        status: 'active',
        mode: 'server_24_7',
        currentTimeArgentina: prev?.currentTimeArgentina || format(new Date(), 'dd/MM/yyyy HH:mm:ss'),
        smtpConfigured: true,
        smtpHost: smtpForm.host,
        smtpUser: smtpForm.user.replace(/(.{2})(.*)(@.*)/, '$1***$3')
      }));

      onShowNotification('Configuración SMTP guardada con éxito para envíos 24/7', 'success');
      await fetchServerStatus();
    } catch (err: any) {
      onShowNotification('Error guardando configuración: ' + (err.message || 'Error desconocido'), 'error');
    } finally {
      setIsSavingSmtp(false);
    }
  };

  // Send Test Email
  const handleSendTestEmail = async () => {
    if (!testEmailTo || !testEmailTo.includes('@')) {
      onShowNotification('Ingrese un correo de destino válido para la prueba', 'error');
      return;
    }

    setIsTestingSmtp(true);
    setTestEmailResult(null);
    try {
      const portNum = parseInt(String(smtpForm.port)) || 587;
      const res = await safeApiCall('/api/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: testEmailTo.trim(),
          customConfig: {
            ...smtpForm,
            port: portNum
          }
        })
      });

      if (res.ok && res.data?.success) {
        setTestEmailResult({ success: true, message: res.data.message });
        onShowNotification(`¡Correo de prueba enviado con éxito a ${testEmailTo}!`, 'success');
        fetchServerStatus();
      } else {
        const errorMsg = res.data?.error || res.error || 'Error al conectar con el servidor SMTP';
        setTestEmailResult({ success: false, message: errorMsg });
        onShowNotification(errorMsg, 'error');
      }
    } catch (err: any) {
      setTestEmailResult({ success: false, message: err.message || 'Error de conexión' });
      onShowNotification('Error enviando prueba: ' + err.message, 'error');
    } finally {
      setIsTestingSmtp(false);
    }
  };

  // Trigger agent execution directly on the server (sends email with Excel attachment)
  const handleExecuteAgentOnServer = async (agent: AgentSchedule) => {
    setIsExecutingServerAgent(agent.id);
    try {
      const res = await safeApiCall(`/api/agent/run-now/${agent.id}`, {
        method: 'POST'
      });
      if (res.ok && res.data?.success) {
        onShowNotification(`Agente "${agent.name}" ejecutado en el servidor. ${res.data.emailSent ? 'Correo enviado con éxito.' : 'Archivo procesado.'}`, 'success');
      } else {
        onShowNotification(`Aviso: ${res.data?.error || res.error || 'Error en ejecución de servidor'}`, 'error');
      }
    } catch (err: any) {
      onShowNotification('Error conectando al servidor: ' + err.message, 'error');
    } finally {
      setIsExecutingServerAgent(null);
    }
  };

  // Apply SMTP Presets
  const handleApplyPreset = (preset: 'office365' | 'outlook_personal' | 'calico_custom' | 'exchange') => {
    isSmtpDirtyRef.current = true;
    switch (preset) {
      case 'office365':
        setSmtpForm(prev => ({
          ...prev,
          host: 'smtp.office365.com',
          port: 587,
          secure: false,
          user: prev.user || 'hsir@calico-sa.com.ar',
          fromEmail: prev.fromEmail || prev.user || 'hsir@calico-sa.com.ar',
          fromName: prev.fromName || 'Calico S.A. Automatizaciones'
        }));
        onShowNotification('Plantilla Microsoft 365 / Outlook Corporativo aplicada (smtp.office365.com : 587).', 'info');
        break;
      case 'outlook_personal':
        setSmtpForm(prev => ({
          ...prev,
          host: 'smtp-mail.outlook.com',
          port: 587,
          secure: false,
          fromName: prev.fromName || 'Calico S.A. Automatizaciones'
        }));
        onShowNotification('Plantilla Outlook Personal / Hotmail aplicada (smtp-mail.outlook.com : 587).', 'info');
        break;
      case 'calico_custom':
        setSmtpForm(prev => ({
          ...prev,
          host: 'mail.calico-sa.com.ar',
          port: 587,
          secure: false,
          user: prev.user || 'hsir@calico-sa.com.ar',
          fromEmail: prev.fromEmail || prev.user || 'hsir@calico-sa.com.ar',
          fromName: prev.fromName || 'Calico S.A. Automatizaciones'
        }));
        onShowNotification('Plantilla Servidor Calico S.A. aplicada (mail.calico-sa.com.ar : 587).', 'info');
        break;
      case 'exchange':
        setSmtpForm(prev => ({
          ...prev,
          host: 'outlook.office365.com',
          port: 587,
          secure: false,
          fromName: prev.fromName || 'Calico S.A. Automatizaciones'
        }));
        onShowNotification('Plantilla Exchange / Relay aplicada.', 'info');
        break;
    }
  };

  // Calculate active agents count
  const activeCount = useMemo(() => agents.filter(a => a.status === 'active').length, [agents]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Top Banner: Agent System Status & Live Clock */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-900/90 to-blue-950/40 rounded-3xl p-6 md:p-8 border border-blue-500/20 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Sistema de Alertas Pop-up y Descargas Automáticas Activo
            </div>
            
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <Bot className="text-blue-400" size={32} />
              Agente de Alertas y Descargas Programadas
            </h2>
            <p className="text-slate-400 text-sm max-w-2xl leading-relaxed">
              En el día y hora que configures, el sistema <strong>descargará automáticamente el archivo Excel (.xlsx)</strong> en tu equipo y mostrará una <strong>alerta pop-up</strong> con el asunto, destinatarios y texto listos para enviar en Outlook con un solo clic.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="bg-slate-950/80 px-4 py-3 rounded-2xl border border-slate-800 backdrop-blur-md">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-mono">
                <Clock size={14} className="text-emerald-400 animate-pulse" />
                <span>HORA DEL SISTEMA</span>
              </div>
              <p className="text-xl font-bold font-mono text-emerald-400 mt-0.5">{currentTime}</p>
              <p className="text-[10px] text-slate-500 capitalize">{currentDateStr}</p>
            </div>

            <button
              onClick={handleOpenNewModal}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-3.5 rounded-2xl shadow-lg shadow-emerald-950/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus size={20} />
              Nuevo Agente
            </button>
          </div>
        </div>

        {/* Sub-Tabs: Agentes y Historial */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800 flex-wrap gap-1">
            <button
              onClick={() => setActiveSubTab('agents')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeSubTab === 'agents' 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Settings size={15} />
              Mis Agentes ({agents.length})
              {activeCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/50">
                  {activeCount} activos
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveSubTab('logs')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeSubTab === 'logs' 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History size={15} />
              Historial de Alertas & Descargas ({logs.length})
            </button>
          </div>

          <div className="flex items-center gap-3">
            {!hasNotificationPermission && typeof window !== 'undefined' && 'Notification' in window && (
              <button
                onClick={handleRequestNotificationPermission}
                className="text-xs text-amber-300 hover:text-amber-200 font-semibold flex items-center gap-1.5 bg-amber-950/40 hover:bg-amber-950/60 px-3 py-1.5 rounded-xl border border-amber-800/50 transition-all"
              >
                <BellRing size={13} className="text-amber-400 animate-bounce" />
                <span>Activar Alertas de Escritorio</span>
              </button>
            )}

            <div className="text-xs text-emerald-400 font-medium flex items-center gap-2 bg-emerald-950/40 px-3 py-1.5 rounded-xl border border-emerald-800/40">
              <Zap size={14} className="text-amber-400" />
              <span>Descarga automática + Alerta pop-up activadas</span>
            </div>
          </div>
        </div>
      </div>

      {/* Subtab Content: Agents List */}
      {activeSubTab === 'agents' && (
        <div className="space-y-6">
          {agents.length === 0 ? (
            <div className="bg-slate-900/60 rounded-3xl p-12 text-center border border-dashed border-slate-800 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto">
                <Bot size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-200">No hay agentes programados</h3>
                <p className="text-slate-500 text-xs max-w-md mx-auto">
                  Crea un agente para descargar automáticamente tus reportes de Abastecimientos, Kilos, Bodegas Bianchi, Cepas, Escorihuela o La Rural y mostrar la alerta con los datos de envío en Outlook.
                </p>
              </div>
              <button
                onClick={handleOpenNewModal}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all"
              >
                <Plus size={16} /> Configurar Primer Agente
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {agents.map((agent) => {
                const fileInfo = FILE_TYPE_OPTIONS.find(o => o.id === agent.file_type) || FILE_TYPE_OPTIONS[0];
                const IconComponent = fileInfo.icon;
                const isRunningThis = isExecutingNow === agent.id;

                return (
                  <div
                    key={agent.id}
                    className={`relative rounded-3xl p-6 border transition-all duration-200 flex flex-col justify-between space-y-5 ${
                      agent.status === 'active' 
                        ? 'bg-slate-900/90 border-slate-800 hover:border-blue-500/50 shadow-xl' 
                        : 'bg-slate-900/40 border-slate-800/60 opacity-70'
                    }`}
                  >
                    <div className="space-y-4">
                      {/* Card Header: Icon, Type & Status Switch */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`p-3 rounded-2xl ${
                            agent.status === 'active' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-slate-800 text-slate-400'
                          }`}>
                            <IconComponent size={24} />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                              {fileInfo.name}
                            </span>
                            <h3 className="text-base font-bold text-white leading-tight mt-0.5 line-clamp-1">
                              {agent.name}
                            </h3>
                          </div>
                        </div>

                        <button
                          onClick={() => handleToggleStatus(agent)}
                          title={agent.status === 'active' ? 'Pausar Agente' : 'Activar Agente'}
                          className={`p-2 rounded-xl transition-all ${
                            agent.status === 'active'
                              ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                              : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'
                          }`}
                        >
                          <Power size={18} />
                        </button>
                      </div>

                      {/* Schedule details */}
                      <div className="space-y-2 bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <Clock size={14} className="text-blue-400" />
                            Hora de Alerta:
                          </span>
                          <span className="font-mono font-bold text-emerald-400 text-sm">
                            {agent.time} hs
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <Calendar size={14} className="text-blue-400" />
                            Frecuencia:
                          </span>
                          <span className="font-semibold text-slate-200">
                            {agent.frequency === 'daily' && 'Diario (L-D)'}
                            {agent.frequency === 'weekdays' && 'Días Hábiles (L-V)'}
                            {agent.frequency === 'weekly' && (
                              `Semanal (${DAYS_OF_WEEK.find(dw => dw.id === ((agent.days_of_week && agent.days_of_week[0]) ?? 1))?.name || 'Lunes'})`
                            )}
                            {agent.frequency === 'fortnightly' && 'Quincenal (1 y 16)'}
                            {agent.frequency === 'monthly_last_day' && (
                              <span className="text-emerald-400 font-bold">Fin de Mes (Último Día: 28/30/31)</span>
                            )}
                            {agent.frequency === 'monthly' && (
                              (agent.monthly_mode === 'last_day' || agent.day_of_month === 'last_day' || agent.day_of_month === 31 || !agent.day_of_month) ? (
                                <span className="text-emerald-400 font-bold">Fin de Mes (Último Día: 28/30/31)</span>
                              ) : (
                                `Mensual (Día ${agent.day_of_month})`
                              )
                            )}
                            {agent.frequency === 'custom_days' && (
                              <span className="flex gap-1">
                                {agent.days_of_week?.map(d => (
                                  <span key={d} className="px-1 py-0.5 bg-slate-800 rounded text-[10px]">
                                    {DAYS_OF_WEEK.find(dw => dw.id === d)?.label}
                                  </span>
                                ))}
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <FileSpreadsheet size={14} className="text-amber-400" />
                            Formato / Rango:
                          </span>
                          <span className="font-mono text-slate-300 text-[11px] uppercase">
                            {agent.file_format.toUpperCase()} • {agent.date_range_preset}
                          </span>
                        </div>
                      </div>

                      {/* Message Body Preview */}
                      <div className="space-y-1 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span className="font-semibold text-blue-400 flex items-center gap-1">
                            <MailCheck size={12} /> Mensaje para el Correo:
                          </span>
                          <button
                            onClick={() => handleOpenEditModal(agent)}
                            className="text-[10px] text-slate-400 hover:text-blue-400 flex items-center gap-0.5"
                          >
                            <Edit3 size={10} /> Personalizar
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-300 italic line-clamp-2 leading-tight">
                          "{agent.email_body || getDefaultEmailBodyForType(agent.file_type)}"
                        </p>
                      </div>

                      {/* Recipients List */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Mail size={13} className="text-slate-400" />
                            Destinatarios ({agent.recipients?.length || 0}):
                          </span>
                        </div>
                        {agent.recipients && agent.recipients.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto custom-scrollbar">
                            {agent.recipients.map((email, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 bg-slate-950 border border-slate-800 text-slate-300 text-[11px] rounded-lg truncate max-w-[200px]"
                                title={email}
                              >
                                {email}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-600 italic">Solo descarga local (sin destinatarios)</span>
                        )}
                      </div>

                      {/* Last Run Info */}
                      {agent.last_run_at && (
                        <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          Última alerta: {agent.last_run_at}
                        </p>
                      )}
                    </div>

                    {/* Actions bar */}
                    <div className="pt-4 border-t border-slate-800/80 flex flex-col gap-2.5">
                      <button
                        onClick={() => handleTriggerAgentWithAlert(agent, 'manual')}
                        disabled={isRunningThis}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-bold py-2.5 px-3 rounded-2xl text-xs shadow-md shadow-blue-950/40 transition-all disabled:opacity-50 hover:scale-[1.01]"
                        title="Descarga automáticamente el reporte en Excel y abre la alerta pop-up con todos los datos para enviar"
                      >
                        {isRunningThis ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <BellRing size={14} className="text-amber-300 animate-bounce" />
                        )}
                        {isRunningThis ? 'Descargando y Abriendo Alerta...' : '🔔 Descargar y Ver Alerta de Envío'}
                      </button>

                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <button
                          onClick={() => handleQuickDownloadOnly(agent)}
                          disabled={isRunningThis}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold py-1.5 px-2.5 rounded-xl text-[11px] transition-all disabled:opacity-50"
                          title="Descarga solo el archivo Excel en tu carpeta de Descargas"
                        >
                          <Download size={12} className="text-emerald-400" />
                          Solo Descargar Excel
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEditModal(agent)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all text-xs"
                            title="Editar Agente"
                          >
                            <Edit3 size={13} />
                          </button>

                          <button
                            onClick={() => handleDeleteAgent(agent.id, agent.name)}
                            className="p-1.5 bg-slate-800 hover:bg-red-950 hover:text-red-400 text-slate-400 rounded-lg transition-all text-xs"
                            title="Eliminar Agente"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Subtab Content: Execution Logs */}
      {activeSubTab === 'logs' && (
        <div className="bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-800 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <History className="text-emerald-500" />
                Historial de Descargas y Notificaciones
              </h3>
              <p className="text-slate-400 text-xs mt-0.5">
                Registro de todas las veces que los agentes ejecutaron y descargaron archivos.
              </p>
            </div>

            {logs.length > 0 && (
              <button
                onClick={handleClearLogs}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-400 rounded-xl text-xs transition-all font-semibold"
              >
                <Trash2 size={14} /> Limpiar Historial
              </button>
            )}
          </div>

          {logs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm italic">
              Aún no hay registros de ejecuciones. Se crearán automáticamente cuando un agente se dispare o se pruebe manualmente.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                    <th className="p-3.5">Fecha y Hora</th>
                    <th className="p-3.5">Agente / Módulo</th>
                    <th className="p-3.5">Archivo Generado</th>
                    <th className="p-3.5">Destinatarios</th>
                    <th className="p-3.5">Disparador</th>
                    <th className="p-3.5">Estado</th>
                    <th className="p-3.5 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {logs.map((log) => {
                    const agentMatch = agents.find(a => a.id === log.agent_id);
                    return (
                      <tr key={log.id} className="hover:bg-slate-800/30 transition-all font-mono">
                        <td className="p-3.5 text-slate-300 whitespace-nowrap">
                          {log.executed_at}
                        </td>
                        <td className="p-3.5 font-sans font-semibold text-white">
                          {log.agent_name}
                        </td>
                        <td className="p-3.5 text-emerald-400 font-bold">
                          {log.file_name}
                        </td>
                        <td className="p-3.5 font-sans text-slate-300">
                          {log.recipients && log.recipients.length > 0 ? (
                            <span className="truncate max-w-[150px] block" title={log.recipients.join(', ')}>
                              {log.recipients.length === 1 ? log.recipients[0] : `${log.recipients.length} destinatarios`}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">Descarga local</span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold uppercase ${
                            log.trigger_type === 'scheduled'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                              : 'bg-blue-950 text-blue-400 border border-blue-800/50'
                          }`}>
                            {log.trigger_type === 'scheduled' ? 'Automático' : 'Manual'}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] font-sans font-semibold">
                            <CheckCircle2 size={12} /> Exitoso
                          </span>
                        </td>
                        <td className="p-3.5 text-right font-sans">
                          {agentMatch && (
                            <button
                              onClick={() => executeAgentTask(agentMatch, 'manual')}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5"
                              title="Re-descargar archivo ahora"
                            >
                              <Download size={12} /> Descargar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Subtab Content: 24/7 SMTP Server Configuration */}
      {activeSubTab === 'smtp_server' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          
          {/* Server 24/7 Status Header Card */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/40 rounded-3xl p-6 md:p-8 border border-blue-500/20 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                  Servidor Autónomo 24/7 en la Nube
                </div>

                <h3 className="text-xl md:text-2xl font-black text-white flex items-center gap-3">
                  <Server className="text-blue-400" />
                  Envío Autónomo de Correos (Con la Aplicación Cerrada)
                </h3>
                <p className="text-slate-300 text-sm max-w-3xl leading-relaxed">
                  El servidor Node.js en la nube monitorea continuamente los horarios y fin de mes configurados en tus agentes. Configura las credenciales SMTP de tu cuenta (Gmail, Outlook, Brevo o Calico) para que los correos con los archivos Excel adjuntos se envíen puntualmente <strong>aunque tengas la computadora apagada o el navegador cerrado</strong>.
                </p>
              </div>

              {/* Status Indicator Widget */}
              <div className="bg-slate-950/90 p-4 rounded-2xl border border-slate-800 shrink-0 space-y-2 min-w-[260px]">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-mono">ESTADO MOTOR:</span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/50 text-[11px] font-bold">
                    <CheckCircle2 size={12} /> ONLINE 24/7
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400 font-mono">ESTADO SMTP:</span>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    (serverStatus?.smtpConfigured || (smtpForm.host && (smtpForm.hasPassword || smtpForm.pass)))
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                      : 'bg-amber-950 text-amber-400 border border-amber-800/50'
                  }`}>
                    {(serverStatus?.smtpConfigured || (smtpForm.host && (smtpForm.hasPassword || smtpForm.pass))) ? (
                      <>
                        <CheckCircle2 size={12} />
                        <span>Conectado {serverStatus?.smtpHost ? `(${serverStatus.smtpHost})` : (smtpForm.host ? `(${smtpForm.host})` : '')}</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={12} />
                        <span>Sin Configurar</span>
                      </>
                    )}
                  </span>
                </div>
                {(serverStatus?.smtpUser || smtpForm.user) && (
                  <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                    <span>Cuenta de Envío:</span>
                    <span className="text-slate-200 font-semibold">{serverStatus?.smtpUser || smtpForm.user}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                  <span>Hora Servidor (Arg): </span>
                  <strong className="text-slate-200">{serverStatus?.currentTimeArgentina || currentTime}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Presets & Form Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left 2 Cols: Form */}
            <div className="lg:col-span-2 bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-800 shadow-xl space-y-6">
              
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h4 className="text-base font-bold text-white flex items-center gap-2">
                    <Settings className="text-emerald-400" size={18} />
                    Configuración de Servidor de Correo (SMTP)
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Selecciona una plantilla rápida o completa los datos de tu servidor.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-emerald-400" />
                  <span className="text-[11px] text-emerald-400 font-semibold">Cifrado Seguro TLS</span>
                </div>
              </div>

              {/* Presets */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  Plantillas de Servidores Outlook / Corporativos:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('office365')}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-blue-950/60 hover:bg-blue-900/80 text-blue-200 text-xs font-bold border border-blue-700/60 transition-all hover:scale-[1.02] shadow-sm"
                  >
                    <Mail size={14} className="text-blue-400" />
                    Microsoft 365 (Corp)
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPreset('outlook_personal')}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all hover:scale-[1.02]"
                  >
                    <Mail size={14} className="text-sky-400" />
                    Outlook / Hotmail
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPreset('calico_custom')}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all hover:scale-[1.02]"
                  >
                    <Mail size={14} className="text-emerald-400" />
                    Servidor Calico S.A.
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPreset('exchange')}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all hover:scale-[1.02]"
                  >
                    <Mail size={14} className="text-indigo-400" />
                    Exchange Relay
                  </button>
                </div>
              </div>

              {/* Form inputs */}
              <form onSubmit={handleSaveSMTPConfig} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">
                      Servidor Host SMTP <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={smtpForm.host}
                      onChange={(e) => {
                        isSmtpDirtyRef.current = true;
                        setSmtpForm(prev => ({ ...prev, host: e.target.value }));
                      }}
                      placeholder="ej. smtp.office365.com o mail.calico-sa.com.ar"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">
                      Puerto SMTP <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={smtpForm.port}
                      onChange={(e) => {
                        isSmtpDirtyRef.current = true;
                        setSmtpForm(prev => ({ ...prev, port: e.target.value }));
                      }}
                      placeholder="587 o 465"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">
                      Usuario / Correo de Outlook <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={smtpForm.user}
                      onChange={(e) => {
                        isSmtpDirtyRef.current = true;
                        setSmtpForm(prev => ({ ...prev, user: e.target.value }));
                      }}
                      placeholder="ej. hsir@calico-sa.com.ar"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                        <Lock size={12} className="text-emerald-400" />
                        Contraseña de Outlook / Microsoft <span className="text-red-400">*</span>
                      </label>
                      {smtpForm.hasPassword && (
                        <span className="text-[10px] text-emerald-400 font-mono font-bold">
                          ✓ Guardada en servidor
                        </span>
                      )}
                    </div>
                    <input
                      type="password"
                      value={smtpForm.pass}
                      onChange={(e) => {
                        isSmtpDirtyRef.current = true;
                        setSmtpForm(prev => ({ ...prev, pass: e.target.value }));
                      }}
                      placeholder={smtpForm.hasPassword ? '•••••••••••••••• (dejar vacío para mantener la actual)' : 'Ingresa tu contraseña de Outlook o App Password'}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">
                      Nombre del Remitente
                    </label>
                    <input
                      type="text"
                      value={smtpForm.fromName}
                      onChange={(e) => {
                        isSmtpDirtyRef.current = true;
                        setSmtpForm(prev => ({ ...prev, fromName: e.target.value }));
                      }}
                      placeholder="ej. Calico S.A. Automatizaciones"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">
                      Correo Remitente Visible (From)
                    </label>
                    <input
                      type="email"
                      value={smtpForm.fromEmail}
                      onChange={(e) => {
                        isSmtpDirtyRef.current = true;
                        setSmtpForm(prev => ({ ...prev, fromEmail: e.target.value }));
                      }}
                      placeholder="ej. hsir@calico-sa.com.ar (opcional)"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-between gap-4">
                  <button
                    type="submit"
                    disabled={isSavingSmtp}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-3 rounded-2xl text-sm shadow-lg shadow-blue-950/40 transition-all disabled:opacity-50"
                  >
                    {isSavingSmtp ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}
                    {isSavingSmtp ? 'Guardando...' : 'Guardar Configuración en Servidor'}
                  </button>

                  <span className="text-xs text-slate-400 font-mono">
                    Protocolo: {smtpForm.port === 465 ? 'SSL (465)' : 'STARTTLS (587)'}
                  </span>
                </div>
              </form>
            </div>

            {/* Right 1 Col: Test Email & Outlook Guidance */}
            <div className="space-y-6">
              
              {/* Test Email Card */}
              <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-xl space-y-4">
                <h4 className="text-base font-bold text-white flex items-center gap-2">
                  <MailCheck className="text-blue-400" size={18} />
                  Probar Envío de Correo Ahora
                </h4>
                <p className="text-xs text-slate-400">
                  Envía un correo de verificación en tiempo real para confirmar que el servidor despacha mensajes y adjuntos por Outlook correctamente.
                </p>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300">
                    Enviar prueba a:
                  </label>
                  <input
                    type="email"
                    value={testEmailTo}
                    onChange={(e) => setTestEmailTo(e.target.value)}
                    placeholder="hsir@calico-sa.com.ar"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={isTestingSmtp}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-md shadow-blue-950/40 transition-all disabled:opacity-50"
                >
                  {isTestingSmtp ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  {isTestingSmtp ? 'Enviando prueba...' : 'Enviar Correo de Prueba'}
                </button>

                {testEmailResult && (
                  <div className={`p-3.5 rounded-xl border text-xs font-medium ${
                    testEmailResult.success 
                      ? 'bg-emerald-950/60 border-emerald-600/50 text-emerald-300' 
                      : 'bg-red-950/60 border-red-600/50 text-red-300'
                  }`}>
                    <p className="font-bold flex items-center gap-1.5">
                      {testEmailResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                      {testEmailResult.success ? '¡Prueba Exitosa!' : 'Error de Conexión'}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed break-words">{testEmailResult.message}</p>
                  </div>
                )}
              </div>

              {/* Outlook / Microsoft 365 Guidance */}
              <div className="bg-slate-900/80 rounded-3xl p-6 border border-slate-800 space-y-3">
                <h5 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                  <HelpCircle size={14} />
                  Configuración para Outlook / Microsoft 365
                </h5>
                <div className="text-xs text-slate-300 space-y-2.5 leading-relaxed">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-[11px] font-mono space-y-1">
                    <p className="text-slate-400">Host: <span className="text-blue-300 font-bold">smtp.office365.com</span></p>
                    <p className="text-slate-400">Puerto: <span className="text-blue-300 font-bold">587 (STARTTLS)</span></p>
                    <p className="text-slate-400">Usuario: <span className="text-slate-200 font-bold">hsir@calico-sa.com.ar</span></p>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
                    <li>Usa tu cuenta de Outlook / Microsoft 365 asignada.</li>
                    <li>Los correos enviados automáticamente por el servidor <strong>incluyen el archivo Excel adjunto</strong> correspondiente.</li>
                    <li>Si tu organización utiliza autenticación en 2 pasos o MFA, puedes generar una <em>Contraseña de Aplicación</em> en la configuración de seguridad de Microsoft.</li>
                  </ul>
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* MODAL: Configurar / Editar Agente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden">
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-5xl xl:max-w-6xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200">
            
            {/* Modal Header (Sticky) */}
            <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/95 backdrop-blur-sm">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                  <Bot size={18} className="text-emerald-400 animate-pulse" />
                  {isEditing ? 'Editar Agente Configurable' : 'Crear Nuevo Agente de Automatización'}
                </div>
                <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
                  Programación de Archivo, Frecuencia, Hora y Destinatarios
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2.5 rounded-2xl text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all"
                title="Cerrar ventana"
              >
                <X size={22} />
              </button>
            </div>

            {/* Modal Form Content (Scrollable with custom scrollbar) */}
            <form id="agent-form" onSubmit={handleSaveAgent} className="flex-1 overflow-y-auto p-5 sm:p-6 md:p-8 space-y-6">
              
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* COLUMNA IZQUIERDA (7 cols en desktop): Identificación, Archivo y Rango de Datos */}
                <div className="lg:col-span-7 space-y-5">
                  
                  {/* 1. Nombre del Agente */}
                  <div className="bg-slate-950/80 p-4 sm:p-5 rounded-2xl border border-slate-800/90 space-y-2">
                    <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-mono">1</span>
                      Nombre Descriptivo de la Tarea / Agente *
                    </label>
                    <input
                      type="text"
                      placeholder="ej. Reporte Diario de Abastecimiento & Saldo Pallets 18:00hs"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-900 border border-slate-700/80 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-slate-100 placeholder:text-slate-500 text-sm font-medium transition-all"
                      required
                    />
                  </div>

                  {/* 2. Tipo de Archivo a Generar */}
                  <div className="bg-slate-950/80 p-4 sm:p-5 rounded-2xl border border-slate-800/90 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                        <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-mono">2</span>
                        Archivo / Reporte a Descargar *
                      </label>
                      <span className="text-[11px] text-emerald-400 font-semibold">
                        {FILE_TYPE_OPTIONS.length} opciones disponibles
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {FILE_TYPE_OPTIONS.map((opt) => {
                        const IconComp = opt.icon;
                        const isSelected = formFileType === opt.id;
                        return (
                          <div
                            key={opt.id}
                            onClick={() => setFormFileType(opt.id)}
                            className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 relative group ${
                              isSelected
                                ? 'bg-emerald-950/50 border-emerald-500 text-white shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-500'
                                : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-600 hover:bg-slate-900'
                            }`}
                          >
                            <div className={`p-2.5 rounded-xl shrink-0 transition-colors ${
                              isSelected ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400 group-hover:text-slate-200'
                            }`}>
                              <IconComp size={18} />
                            </div>
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <p className="text-xs font-bold truncate">{opt.name}</p>
                                <span className={`text-[9px] font-mono uppercase font-bold px-1.5 py-0.5 rounded ${
                                  isSelected 
                                    ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-500/40' 
                                    : 'bg-slate-800 text-slate-400'
                                }`}>
                                  {opt.format}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 leading-snug">{opt.desc}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. Rango de datos */}
                  <div className="bg-slate-950/80 p-4 sm:p-5 rounded-2xl border border-slate-800/90 space-y-2.5">
                    <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-mono">3</span>
                      Rango de Datos a Procesar en el Archivo
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'all', label: 'Todo el Historial' },
                        { id: 'current_month', label: 'Mes en Curso' },
                        { id: 'current_fortnight', label: 'Quincena Actual' },
                        { id: 'last_7_days', label: 'Últimos 7 Días' },
                      ].map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setFormDatePreset(preset.id as AgentDatePreset)}
                          className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border text-center ${
                            formDatePreset === preset.id
                              ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-950/30'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>

                {/* COLUMNA DERECHA (5 cols en desktop): Programación, Destinatarios y Envíos */}
                <div className="lg:col-span-5 space-y-5">
                  
                  {/* 4. Programación de Día y Hora */}
                  <div className="bg-slate-950/80 p-4 sm:p-5 rounded-2xl border border-slate-800/90 space-y-4">
                    <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-mono">4</span>
                      Programación de Frecuencia y Hora *
                    </label>

                    {/* Selector de Frecuencia */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-slate-400 block">
                        Frecuencia de Ejecución:
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {[
                          { id: 'monthly', label: 'Mensual / Fin de Mes' },
                          { id: 'weekdays', label: 'Días Hábiles (L-V)' },
                          { id: 'daily', label: 'Diario (L-D)' },
                          { id: 'weekly', label: 'Semanal' },
                          { id: 'fortnightly', label: 'Quincenal (1 y 16)' },
                          { id: 'custom_days', label: 'Días Específicos' },
                        ].map((freq) => (
                          <button
                            key={freq.id}
                            type="button"
                            onClick={() => {
                              setFormFrequency(freq.id as AgentFrequency);
                              if (freq.id === 'monthly') {
                                setFormMonthlyMode('last_day');
                                setFormDayOfMonth(31);
                              }
                            }}
                            className={`px-2.5 py-2.5 rounded-xl text-xs font-bold transition-all border text-center ${
                              formFrequency === freq.id
                                ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-950/30'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                            }`}
                          >
                            {freq.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Sub-opciones si es Mensual */}
                    {formFrequency === 'monthly' && (
                      <div className="space-y-3 p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                            <Calendar size={14} className="text-emerald-400" />
                            Modalidad del Envío Mensual:
                          </span>
                          <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                            {formMonthlyMode === 'last_day' ? 'Fin de Mes (Dinámico)' : `Día ${formDayOfMonth} de cada mes`}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {/* Opción Último Día del Mes */}
                          <button
                            type="button"
                            onClick={() => {
                              setFormMonthlyMode('last_day');
                              setFormDayOfMonth(31);
                            }}
                            className={`p-3 rounded-xl text-left border transition-all ${
                              formMonthlyMode === 'last_day'
                                ? 'bg-emerald-950/60 border-emerald-500 text-white ring-1 ring-emerald-500 shadow-md'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 size={13} />
                                Último Día del Mes
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono uppercase">
                                Recomendado
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-300 leading-snug">
                              Envía el último día calendario sin importar si el mes tiene <strong>30</strong> ó <strong>31</strong> días (o 28/29 en Febrero).
                            </p>
                          </button>

                          {/* Opción Día Fijo */}
                          <button
                            type="button"
                            onClick={() => {
                              setFormMonthlyMode('specific_day');
                              if (formDayOfMonth === 31) setFormDayOfMonth(1);
                            }}
                            className={`p-3 rounded-xl text-left border transition-all ${
                              formMonthlyMode === 'specific_day'
                                ? 'bg-emerald-950/60 border-emerald-500 text-white ring-1 ring-emerald-500 shadow-md'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-blue-400 flex items-center gap-1">
                                <Clock size={13} />
                                Día Fijo Específico
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono uppercase">
                                Manual
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-300 leading-snug">
                              Elige un número de día específico (1 al 31) para realizar la descarga y notificación.
                            </p>
                          </button>
                        </div>

                        {/* Selector de número de día si es específico */}
                        {formMonthlyMode === 'specific_day' ? (
                          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/80">
                            <span className="text-[11px] font-semibold text-slate-300">
                              Número de día del mes:
                            </span>
                            <input
                              type="number"
                              min="1"
                              max="31"
                              value={formDayOfMonth || ''}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === '') {
                                  setFormDayOfMonth('' as any);
                                } else {
                                  const val = parseInt(raw);
                                  if (!isNaN(val)) {
                                    setFormDayOfMonth(Math.max(1, Math.min(31, val)));
                                  }
                                }
                              }}
                              onBlur={() => {
                                if (!formDayOfMonth || isNaN(Number(formDayOfMonth))) {
                                  setFormDayOfMonth(1);
                                }
                              }}
                              className="w-24 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-emerald-400 font-mono font-bold text-center text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                            <span className="text-[10px] text-slate-400 italic">
                              * Si el mes tiene menos días (ej. día 31 en mes de 30 días), se ejecutará el último día disponible.
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
                            <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
                            <span>
                              <strong>Ajuste automático garantizado:</strong> El correo se enviará el 31 en meses de 31 días, el 30 en meses de 30 días y el 28/29 en Febrero.
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Días de la semana si es custom_days o weekly */}
                    {(formFrequency === 'custom_days' || formFrequency === 'weekly') && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[11px] font-semibold text-slate-400 block">
                          {formFrequency === 'weekly' ? 'Día de la semana a ejecutar:' : 'Selecciona los días activos:'}
                        </span>
                        <div className="grid grid-cols-7 gap-1">
                          {DAYS_OF_WEEK.map((d) => {
                            const isSelected = formDaysOfWeek.includes(d.id);
                            return (
                              <button
                                key={d.id}
                                type="button"
                                title={d.name}
                                onClick={() => {
                                  if (formFrequency === 'weekly') {
                                    setFormDaysOfWeek([d.id]);
                                  } else {
                                    handleToggleDay(d.id);
                                  }
                                }}
                                className={`py-2 rounded-xl text-xs font-bold border transition-all text-center ${
                                  isSelected
                                    ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-sm'
                                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                {d.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Selector de Hora */}
                    <div className="space-y-2 pt-1 border-t border-slate-800/80">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-400">
                          Hora exacta de ejecución (24hs):
                        </span>
                        <span className="text-[10px] font-mono text-emerald-400 font-bold">
                          Hora elegida: {formTime} hs
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="time"
                          value={formTime}
                          onChange={(e) => setFormTime(e.target.value)}
                          className="px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-emerald-400 font-mono text-base font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                          required
                        />
                        
                        <div className="flex flex-wrap gap-1">
                          {['08:00', '12:00', '18:00', '20:00'].map((h) => (
                            <button
                              key={h}
                              type="button"
                              onClick={() => setFormTime(h)}
                              className={`px-2 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all border ${
                                formTime === h
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {h}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 5. Destinatarios y Envíos */}
                  <div className="bg-slate-950/80 p-4 sm:p-5 rounded-2xl border border-slate-800/90 space-y-3.5">
                    <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-mono">5</span>
                      Destinatarios para Envío y Notificación
                    </label>

                    {/* Email Input */}
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="email"
                          placeholder="ej. logistica@calico.com.ar"
                          value={recipientInput}
                          onChange={(e) => setRecipientInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ',') {
                              e.preventDefault();
                              handleAddRecipient();
                            }
                          }}
                          className="flex-1 px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 text-xs focus:ring-2 focus:ring-emerald-500 outline-none placeholder:text-slate-500"
                        />
                        <button
                          type="button"
                          onClick={handleAddRecipient}
                          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1 shrink-0"
                        >
                          <Plus size={14} /> Agregar
                        </button>
                      </div>

                      {/* Suggestions */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                        <span>Sugerencias:</span>
                        {['logistica@calico.com.ar', 'bodegas@calico.com.ar', 'administracion@calico.com.ar'].map((sug) => (
                          <button
                            key={sug}
                            type="button"
                            onClick={() => {
                              if (!formRecipients.includes(sug)) {
                                setFormRecipients([...formRecipients, sug]);
                              }
                            }}
                            className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded-md border border-slate-800 transition-colors"
                          >
                            +{sug.split('@')[0]}
                          </button>
                        ))}
                      </div>

                      {/* Recipient Chips */}
                      {formRecipients.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-1 max-h-24 overflow-y-auto">
                          {formRecipients.map((email) => (
                            <span
                              key={email}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-xs rounded-xl font-medium"
                            >
                              <Mail size={11} className="text-emerald-400" />
                              <span className="truncate max-w-[170px]">{email}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveRecipient(email)}
                                className="hover:text-red-400 p-0.5 rounded-full"
                                title="Quitar destinatario"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500 italic pt-1">
                          Sin destinatarios asignados (solo descarga automática en el equipo).
                        </p>
                      )}
                    </div>

                    {/* Optional Subject */}
                    <div className="space-y-2 pt-1">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-semibold text-slate-300">
                            Asunto del Correo:
                          </label>
                          <span className="text-[10px] text-slate-500">
                            (Opcional - vacío usa asunto estándar)
                          </span>
                        </div>
                        <input
                          type="text"
                          placeholder="ej. [AUTOMÁTICO] Fijo Semanal Bianchi - Calico S.A."
                          value={formSubject}
                          onChange={(e) => setFormSubject(e.target.value)}
                          className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 text-xs placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                      </div>
                    </div>

                    {/* 6. Dedicated Message Body Editor per Client */}
                    <div className="space-y-3 pt-3 border-t border-slate-800/80">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                          <MailCheck size={14} />
                          Cuerpo del Mensaje para el Cliente:
                        </label>
                        
                        <button
                          type="button"
                          onClick={() => setFormBody(getDefaultEmailBodyForType(formFileType))}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 transition-all flex items-center gap-1"
                          title="Restablecer el texto al recomendado para este cliente"
                        >
                          <RefreshCw size={10} /> Cargar Plantilla Sugerida
                        </button>
                      </div>

                      {/* Client Template Buttons */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                          Plantillas Rápidas por Cliente:
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {[
                            { id: 'bianchi', label: '🍇 Bianchi', text: 'Estimados,\n\nComparto el fijo semanal de Bodegas Bianchi.\n\nSaludos cordiales,\nCalico S.A.' },
                            { id: 'cepas', label: '🍷 Cepas', text: 'Estimados,\n\nComparto el reporte de posiciones de Cepas.\n\nSaludos cordiales,\nCalico S.A.' },
                            { id: 'escorihuela', label: '🍾 Escorihuela', text: 'Estimados,\n\nComparto el reporte de posiciones de Escorihuela Gascón.\n\nSaludos cordiales,\nCalico S.A.' },
                            { id: 'la_rural', label: '🥂 La Rural', text: 'Estimados,\n\nComparto el reporte de posiciones de La Rural (Rutini Wines).\n\nSaludos cordiales,\nCalico S.A.' },
                            { id: 'abastecimientos', label: '🚛 Abastecimiento', text: 'Estimados,\n\nComparto el reporte de abastecimientos y movimientos de pallets.\n\nSaludos cordiales,\nCalico S.A.' },
                            { id: 'kilos', label: '⚖️ Raizen Kilos', text: 'Estimados,\n\nComparto el reporte de stock diario de kilos de Raizen.\n\nSaludos cordiales,\nCalico S.A.' },
                          ].map((tmpl) => (
                            <button
                              key={tmpl.id}
                              type="button"
                              onClick={() => setFormBody(tmpl.text)}
                              className={`p-2 rounded-xl text-left border text-[11px] font-medium transition-all ${
                                formFileType === tmpl.id
                                  ? 'bg-slate-900 border-emerald-500/50 text-emerald-300 hover:bg-slate-850'
                                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                              }`}
                            >
                              <span className="font-bold block">{tmpl.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Textarea for Custom Email Body */}
                      <div className="space-y-1.5">
                        <textarea
                          placeholder="Escribe aquí el cuerpo del mensaje que recibirá el cliente..."
                          value={formBody}
                          onChange={(e) => setFormBody(e.target.value)}
                          rows={4}
                          className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 text-xs resize-y placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500 outline-none leading-relaxed font-sans"
                        />

                        {/* Quick Tags Inserter */}
                        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5 text-[10px]">
                          <div className="flex flex-wrap items-center gap-1 text-slate-400">
                            <span className="font-semibold">Insertar etiqueta:</span>
                            {[
                              { tag: '{archivo}', label: '+ Archivo' },
                              { tag: '{periodo}', label: '+ Período' },
                              { tag: '{resumen}', label: '+ Métricas' },
                            ].map(item => (
                              <button
                                key={item.tag}
                                type="button"
                                onClick={() => setFormBody(prev => `${prev} ${item.tag}`)}
                                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 font-mono transition-colors"
                                title={`Insertar ${item.tag}`}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>

                          <span className="text-slate-500 font-mono">
                            {formBody.length} caracteres
                          </span>
                        </div>
                      </div>

                      {/* Live Email Preview */}
                      <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                            <Eye size={12} className="text-emerald-400" />
                            Vista Previa de lo que recibirá el cliente:
                          </span>
                          <span className="text-emerald-400 font-mono font-bold">HTML + Excel Adjunto</span>
                        </div>
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 text-[11px] text-slate-300 font-sans space-y-2 whitespace-pre-wrap">
                          <p className="text-slate-100 font-medium">{formBody || getDefaultEmailBodyForType(formFileType)}</p>
                          <div className="pt-2 border-t border-slate-800 text-[10px] text-emerald-400 font-mono flex items-center gap-1 font-semibold">
                            <span>📎 Archivo adjunto: Reporte_{formFileType.toUpperCase()}_XXXX.xlsx</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Checkbox auto download */}
                    <div className="flex items-center gap-2.5 pt-2 border-t border-slate-800">
                      <input
                        type="checkbox"
                        id="auto_download"
                        checked={formAutoDownload}
                        onChange={(e) => setFormAutoDownload(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 bg-slate-900 border-slate-700 cursor-pointer"
                      />
                      <label htmlFor="auto_download" className="text-xs text-slate-300 cursor-pointer font-medium select-none">
                        Descargar archivo automáticamente a la PC al dispararse la hora
                      </label>
                    </div>

                  </div>

                </div>

              </div>

            </form>

            {/* Modal Footer (Sticky) */}
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/95 backdrop-blur-sm flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <Sparkles size={14} className="text-emerald-400 shrink-0" />
                <span className="truncate">
                  El agente se ejecutará a las <strong className="text-emerald-400 font-mono">{formTime} hs</strong> (
                  <strong className="text-slate-200">
                    {formFrequency === 'monthly'
                      ? (formMonthlyMode === 'last_day' ? 'Último día de cada mes' : `Día ${formDayOfMonth} del mes`)
                      : formFrequency === 'weekdays'
                      ? 'Días hábiles L-V'
                      : formFrequency === 'daily'
                      ? 'Todos los días'
                      : formFrequency === 'weekly'
                      ? 'Semanal'
                      : formFrequency === 'fortnightly'
                      ? 'Quincenal (1 y 16)'
                      : 'Días específicos'}
                  </strong>
                  ) y descargará <strong className="text-white">{FILE_TYPE_OPTIONS.find(f => f.id === formFileType)?.name}</strong>.
                </span>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  form="agent-form"
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 transition-all flex items-center gap-2"
                >
                  <Bot size={16} />
                  {isEditing ? 'Actualizar Agente' : 'Guardar y Activar Agente'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: Live Execution Alert & Outlook Email Dispatch */}
      {executionResult && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-blue-500/50 rounded-3xl max-w-xl w-full p-6 md:p-8 space-y-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setExecutionResult(null)}
              className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            >
              <X size={20} />
            </button>

            {/* Alert Header */}
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto border-2 border-blue-500/40 shadow-lg shadow-blue-500/20">
                <BellRing size={34} className="animate-bounce text-amber-300" />
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-bold uppercase tracking-wider">
                <Sparkles size={12} /> ¡Alerta de Envío de Reporte!
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight">
                Reporte Descargado Automáticamente
              </h2>
              <p className="text-slate-300 text-xs max-w-md mx-auto leading-relaxed">
                El agente <strong className="text-blue-400">"{executionResult.agent.name}"</strong> descargó el archivo Excel en tu equipo y preparó todos los datos para enviar por Outlook.
              </p>
            </div>

            {/* File info card with verified column format */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
                    <FileSpreadsheet size={22} />
                  </div>
                  <div>
                    <span className="font-mono text-sm font-bold text-white block">
                      {executionResult.fileResult.fileName}
                    </span>
                    <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                      <Check size={13} /> Guardado en tu carpeta de Descargas
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => triggerBrowserDownload(executionResult.fileResult.blob, executionResult.fileResult.fileName)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm shrink-0"
                  title="Volver a descargar el archivo Excel"
                >
                  <Download size={13} /> Re-descargar
                </button>
              </div>

              {/* Format Badge */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-950/40 rounded-xl border border-emerald-800/40 text-[11px] text-emerald-300">
                <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                <span><strong>Columnas:</strong> Fecha [DD, MM, AAAA] • Día • Cantidad</span>
              </div>

              {/* Summary line */}
              <div className="p-2.5 bg-slate-900/90 rounded-xl border border-slate-800/80 text-xs font-mono text-slate-300">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-0.5">Resumen de datos:</span>
                {executionResult.fileResult.summaryText}
              </div>

              {/* Copyable Destinatarios, Asunto y Cuerpo */}
              <div className="space-y-2.5 pt-2 border-t border-slate-800/80 text-xs">
                
                {/* 1. Destinatarios */}
                <div className="flex items-center justify-between gap-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Destinatarios ({executionResult.agent.recipients?.length || 1}):
                    </span>
                    <p className="font-mono text-slate-200 text-xs truncate mt-0.5">
                      {executionResult.agent.recipients && executionResult.agent.recipients.length > 0 
                        ? executionResult.agent.recipients.join('; ') 
                        : 'hsir@calico-sa.com.ar'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopyField(
                      executionResult.agent.recipients && executionResult.agent.recipients.length > 0 
                        ? executionResult.agent.recipients.join('; ') 
                        : 'hsir@calico-sa.com.ar',
                      'recipients',
                      'Destinatarios'
                    )}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all shrink-0"
                    title="Copiar lista de destinatarios"
                  >
                    {copiedField === 'recipients' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    {copiedField === 'recipients' ? 'Copiado' : 'Copiar'}
                  </button>
                </div>

                {/* 2. Asunto */}
                <div className="flex items-center justify-between gap-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Asunto:
                    </span>
                    <p className="font-medium text-slate-200 text-xs truncate mt-0.5">
                      {executionResult.fileResult.emailSubject}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopyField(
                      executionResult.fileResult.emailSubject,
                      'subject',
                      'Asunto'
                    )}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all shrink-0"
                    title="Copiar asunto"
                  >
                    {copiedField === 'subject' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    {copiedField === 'subject' ? 'Copiado' : 'Copiar'}
                  </button>
                </div>

                {/* 3. Cuerpo */}
                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Cuerpo del Correo:
                    </span>
                    <button
                      onClick={() => handleCopyField(
                        executionResult.fileResult.emailBody,
                        'body',
                        'Cuerpo del mensaje'
                      )}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all shrink-0"
                      title="Copiar texto del correo"
                    >
                      {copiedField === 'body' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      {copiedField === 'body' ? 'Copiado' : 'Copiar Texto'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-300 italic line-clamp-3 leading-relaxed whitespace-pre-line bg-slate-950/60 p-2 rounded-lg border border-slate-800/50">
                    {executionResult.fileResult.emailBody}
                  </p>
                </div>

              </div>
            </div>

            {/* Quick Outlook Dispatch buttons */}
            <div className="space-y-3">
              <div className="p-3 bg-blue-950/40 rounded-2xl border border-blue-800/50 space-y-2">
                <p className="text-xs text-blue-200 leading-relaxed">
                  💡 <strong>¿Deseas redactarlo ahora mismo?</strong> Haz clic abajo para abrir un nuevo mensaje en Outlook con los destinatarios, asunto y cuerpo completados automáticamente, y adjunta el archivo <span className="font-mono text-emerald-400 font-semibold">{executionResult.fileResult.fileName}</span>.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => triggerMailto(
                      executionResult.agent.recipients && executionResult.agent.recipients.length > 0 ? executionResult.agent.recipients : ['hsir@calico-sa.com.ar'], 
                      executionResult.fileResult.emailSubject, 
                      executionResult.fileResult.emailBody
                    )}
                    className="py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 text-xs"
                  >
                    <Mail size={14} />
                    Abrir en Outlook App (Escritorio)
                  </button>

                  <button
                    onClick={() => openOutlookWeb(
                      executionResult.agent.recipients && executionResult.agent.recipients.length > 0 ? executionResult.agent.recipients : ['hsir@calico-sa.com.ar'], 
                      executionResult.fileResult.emailSubject, 
                      executionResult.fileResult.emailBody
                    )}
                    className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-1.5 text-xs"
                  >
                    <ExternalLink size={14} className="text-blue-400" />
                    Abrir en Outlook Web (M365)
                  </button>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setExecutionResult(null)}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl text-xs transition-all shadow-md flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={16} className="text-emerald-400" />
                Cerrar Alerta
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
