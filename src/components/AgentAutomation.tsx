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
  playSuccessChime, 
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

  // Fetch Server status ONLY (polling safe - never touches user input form)
  const fetchServerStatus = async () => {
    try {
      const resStatus = await fetch('/api/agent/server-status');
      if (resStatus.ok) {
        const data = await resStatus.json();
        setServerStatus(data);
      }
    } catch (e) {
      console.warn('Servidor status temporalmente no disponible:', e);
    }
  };

  // Load SMTP config only once or when requested (will NOT overwrite if user is typing)
  const loadSMTPConfig = async (force = false) => {
    if (!force && isSmtpDirtyRef.current) return;
    try {
      const resSmtp = await fetch('/api/smtp/config');
      if (resSmtp.ok) {
        const data = await resSmtp.json();
        setSmtpForm(prev => {
          if (!force && isSmtpDirtyRef.current) return prev;
          return {
            host: data.host || '',
            port: data.port || 587,
            secure: data.secure || false,
            user: data.user || '',
            pass: '',
            fromName: data.fromName || 'Calico S.A. Automatizaciones',
            fromEmail: data.fromEmail || '',
            hasPassword: !!data.hasPassword
          };
        });
      }
    } catch (e) {
      console.warn('Configuración SMTP temporalmente no disponible:', e);
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

  const [copiedSummary, setCopiedSummary] = useState(false);
  const [isExecutingNow, setIsExecutingNow] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>(format(new Date(), 'HH:mm:ss'));
  const [currentDateStr, setCurrentDateStr] = useState<string>(format(new Date(), 'EEEE, d MMMM yyyy', { locale: es }));

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
            executeAgentTask(agent, 'scheduled');
          }
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [agents, datasets]);

  // Execute Agent Task (Manual or Scheduled)
  const executeAgentTask = async (agent: AgentSchedule, triggerType: 'scheduled' | 'manual') => {
    setIsExecutingNow(agent.id);
    try {
      const fileResult = generateAgentFile(agent, datasets);

      // Auto download if enabled
      if (agent.auto_download) {
        triggerBrowserDownload(fileResult.blob, fileResult.fileName);
      }

      playSuccessChime();

      // Show execution modal
      setExecutionResult({
        agent,
        fileResult,
        triggerType
      });

      const now = new Date();
      const executedAt = format(now, 'yyyy-MM-dd HH:mm:ss');
      const todayDateKey = format(now, 'yyyy-MM-dd');

      // Update agent last run
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
        `Agente "${agent.name}" ejecutado con éxito. Archivo "${fileResult.fileName}" descargado.`,
        'success'
      );
    } catch (err) {
      console.error('Error executing agent:', err);
      onShowNotification(`Error al ejecutar el agente "${agent.name}"`, 'error');
    } finally {
      setIsExecutingNow(null);
    }
  };

  // Open Form for New Agent
  const handleOpenNewModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormName('');
    setFormFileType('abastecimientos');
    setFormDatePreset('all');
    setFormFrequency('monthly');
    setFormMonthlyMode('last_day');
    setFormDaysOfWeek([1, 2, 3, 4, 5]);
    setFormDayOfMonth(31);
    setFormTime('08:00');
    setFormRecipients([]);
    setRecipientInput('');
    setFormSubject('');
    setFormBody('');
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
    setFormBody(agent.email_body || '');
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
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  // Save SMTP Settings
  const handleSaveSMTPConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smtpForm.host || !smtpForm.user) {
      onShowNotification('Ingrese al menos el Servidor Host y Usuario SMTP', 'error');
      return;
    }

    setIsSavingSmtp(true);
    try {
      const portNum = parseInt(String(smtpForm.port)) || 587;
      const payload = {
        ...smtpForm,
        port: portNum
      };

      const res = await fetch('/api/smtp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        isSmtpDirtyRef.current = false;
        setSmtpForm(prev => ({
          ...prev,
          pass: '',
          hasPassword: true
        }));
        onShowNotification('Configuración SMTP guardada con éxito en el servidor 24/7', 'success');
        fetchServerStatus();
      } else {
        onShowNotification(data.error || 'Error al guardar configuración SMTP', 'error');
      }
    } catch (err: any) {
      onShowNotification('Error de conexión con el servidor: ' + err.message, 'error');
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
      const res = await fetch('/api/smtp/test', {
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
      const data = await res.json();
      if (res.ok && data.success) {
        setTestEmailResult({ success: true, message: data.message });
        onShowNotification(`¡Correo de prueba enviado con éxito a ${testEmailTo}!`, 'success');
        fetchServerStatus();
      } else {
        setTestEmailResult({ success: false, message: data.error || 'Error al enviar correo de prueba' });
        onShowNotification(data.error || 'Error al enviar correo de prueba', 'error');
      }
    } catch (err: any) {
      setTestEmailResult({ success: false, message: err.message });
      onShowNotification('Error enviando prueba: ' + err.message, 'error');
    } finally {
      setIsTestingSmtp(false);
    }
  };

  // Trigger agent execution directly on the server (sends email with Excel attachment)
  const handleExecuteAgentOnServer = async (agent: AgentSchedule) => {
    setIsExecutingServerAgent(agent.id);
    try {
      const res = await fetch(`/api/agent/run-now/${agent.id}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onShowNotification(`Agente "${agent.name}" ejecutado en el servidor. ${data.emailSent ? 'Correo enviado con éxito.' : 'Archivo procesado.'}`, 'success');
      } else {
        onShowNotification(`Aviso: ${data.error || 'Error en ejecución de servidor'}`, 'error');
      }
    } catch (err: any) {
      onShowNotification('Error conectando al servidor: ' + err.message, 'error');
    } finally {
      setIsExecutingServerAgent(null);
    }
  };

  // Apply SMTP Presets
  const handleApplyPreset = (preset: 'gmail' | 'office365' | 'brevo' | 'sendgrid') => {
    isSmtpDirtyRef.current = true;
    switch (preset) {
      case 'gmail':
        setSmtpForm(prev => ({
          ...prev,
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          user: prev.user || 'hugofsir@gmail.com',
          fromEmail: prev.fromEmail || prev.user || 'hugofsir@gmail.com',
          fromName: prev.fromName || 'Calico S.A. Automatizaciones'
        }));
        onShowNotification('Plantilla Gmail aplicada. Recuerda usar una Contraseña de Aplicación de 16 letras de Google.', 'info');
        break;
      case 'office365':
        setSmtpForm(prev => ({
          ...prev,
          host: 'smtp.office365.com',
          port: 587,
          secure: false,
          fromName: prev.fromName || 'Calico S.A. Automatizaciones'
        }));
        onShowNotification('Plantilla Microsoft 365 / Outlook aplicada.', 'info');
        break;
      case 'brevo':
        setSmtpForm(prev => ({
          ...prev,
          host: 'smtp-relay.brevo.com',
          port: 587,
          secure: false,
          fromName: prev.fromName || 'Calico S.A. Automatizaciones'
        }));
        onShowNotification('Plantilla Brevo SMTP aplicada.', 'info');
        break;
      case 'sendgrid':
        setSmtpForm(prev => ({
          ...prev,
          host: 'smtp.sendgrid.net',
          port: 587,
          secure: false,
          user: 'apikey',
          fromName: prev.fromName || 'Calico S.A. Automatizaciones'
        }));
        onShowNotification('Plantilla SendGrid aplicada (Usuario fijado en "apikey").', 'info');
        break;
    }
  };

  // Calculate active agents count
  const activeCount = useMemo(() => agents.filter(a => a.status === 'active').length, [agents]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Top Banner: Agent System Status & Live Clock */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/40 rounded-3xl p-6 md:p-8 border border-emerald-500/20 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Agente Autónomo de Descargas & Notificaciones Activo
            </div>
            
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <Bot className="text-emerald-400" size={32} />
              Agente Configurable de Archivos y Envíos
            </h2>
            <p className="text-slate-400 text-sm max-w-2xl leading-relaxed">
              Programa la generación automática de archivos (Excel XLSX / JSON), define el día y la hora exacta de descarga, y asigna los destinatarios para notificaciones y remisiones automáticas.
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

        {/* Sub-Tabs: Agentes, Historial, Servidor 24/7 */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800 flex-wrap gap-1">
            <button
              onClick={() => setActiveSubTab('agents')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeSubTab === 'agents' 
                  ? 'bg-emerald-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Settings size={15} />
              Agentes Configurados ({agents.length})
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
                  ? 'bg-emerald-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History size={15} />
              Historial de Descargas & Envíos ({logs.length})
            </button>

            <button
              onClick={() => setActiveSubTab('smtp_server')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeSubTab === 'smtp_server' 
                  ? 'bg-emerald-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Server size={15} />
              Servidor 24/7 (Envío con App Cerrada)
              {serverStatus?.smtpConfigured ? (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/50">
                  SMTP Listo
                </span>
              ) : (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-amber-950 text-amber-300 border border-amber-700/50">
                  Configurar
                </span>
              )}
            </button>
          </div>

          <div className="text-xs text-emerald-400 font-medium flex items-center gap-2 bg-emerald-950/40 px-3 py-1.5 rounded-xl border border-emerald-800/40">
            <Zap size={14} className="text-amber-400 animate-bounce" />
            <span>Motor 24/7 en Servidor Activo: Los correos se envían incluso con la app cerrada.</span>
          </div>
        </div>
      </div>

      {/* Subtab Content: Agents List */}
      {activeSubTab === 'agents' && (
        <div className="space-y-6">
          {agents.length === 0 ? (
            <div className="bg-slate-900/60 rounded-3xl p-12 text-center border border-dashed border-slate-800 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                <Bot size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-200">No hay agentes programados</h3>
                <p className="text-slate-500 text-xs max-w-md mx-auto">
                  Crea tu primer agente para descargar automáticamente tus reportes de Abastecimientos, Kilos, Bodegas Bianchi, Cepas, Escorihuela o La Rural y enviarlos a tus destinatarios.
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
                        ? 'bg-slate-900/90 border-slate-800 hover:border-emerald-500/50 shadow-xl' 
                        : 'bg-slate-900/40 border-slate-800/60 opacity-70'
                    }`}
                  >
                    <div className="space-y-4">
                      {/* Card Header: Icon, Type & Status Switch */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`p-3 rounded-2xl ${
                            agent.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'
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
                            <Clock size={14} className="text-emerald-400" />
                            Hora de Ejecución:
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
                          Última ejecución: {agent.last_run_at}
                        </p>
                      )}
                    </div>

                    {/* Actions bar */}
                    <div className="pt-4 border-t border-slate-800/80 flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleExecuteAgentOnServer(agent)}
                          disabled={isExecutingServerAgent === agent.id}
                          className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-2.5 rounded-xl text-[11px] shadow-md shadow-blue-950/30 transition-all disabled:opacity-50"
                          title="Genera el archivo en el servidor y lo envía por correo electrónico inmediatamente"
                        >
                          {isExecutingServerAgent === agent.id ? (
                            <RefreshCw size={13} className="animate-spin" />
                          ) : (
                            <Send size={13} />
                          )}
                          {isExecutingServerAgent === agent.id ? 'Enviando...' : '⚡ Enviar Correo'}
                        </button>

                        <button
                          onClick={() => executeAgentTask(agent, 'manual')}
                          disabled={isRunningThis}
                          className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-2.5 rounded-xl text-[11px] shadow-md shadow-emerald-950/30 transition-all disabled:opacity-50"
                          title="Descargar archivo directamente en tu navegador"
                        >
                          {isRunningThis ? (
                            <RefreshCw size={13} className="animate-spin" />
                          ) : (
                            <Download size={13} />
                          )}
                          {isRunningThis ? 'Generando...' : 'Descargar'}
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                          <Server size={11} className="text-emerald-400" /> Servidor 24/7
                        </span>

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
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-mono">ESTADO SMTP:</span>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    serverStatus?.smtpConfigured
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                      : 'bg-amber-950 text-amber-400 border border-amber-800/50'
                  }`}>
                    {serverStatus?.smtpConfigured ? 'Conectado' : 'Sin Configurar'}
                  </span>
                </div>
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
                  Plantillas Rápidas de Configuración:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('gmail')}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all hover:scale-[1.02]"
                  >
                    <Mail size={14} className="text-red-400" />
                    Gmail / Google
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPreset('office365')}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all hover:scale-[1.02]"
                  >
                    <Mail size={14} className="text-blue-400" />
                    Microsoft 365
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPreset('brevo')}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all hover:scale-[1.02]"
                  >
                    <Mail size={14} className="text-emerald-400" />
                    Brevo (Sendinblue)
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPreset('sendgrid')}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all hover:scale-[1.02]"
                  >
                    <Mail size={14} className="text-indigo-400" />
                    SendGrid
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
                      placeholder="ej. smtp.gmail.com o mail.calico.com.ar"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
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
                      Usuario / Correo de Envío <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={smtpForm.user}
                      onChange={(e) => {
                        isSmtpDirtyRef.current = true;
                        setSmtpForm(prev => ({ ...prev, user: e.target.value }));
                      }}
                      placeholder="ej. hugofsir@gmail.com"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                        <Lock size={12} className="text-emerald-400" />
                        Contraseña / App Password <span className="text-red-400">*</span>
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
                      placeholder={smtpForm.hasPassword ? '•••••••••••••••• (dejar vacío para mantener)' : 'Ingresa la contraseña o App Password'}
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
                      placeholder="ej. reportes@calico.com.ar (opcional)"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-between gap-4">
                  <button
                    type="submit"
                    disabled={isSavingSmtp}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-2xl text-sm shadow-lg shadow-emerald-950/40 transition-all disabled:opacity-50"
                  >
                    {isSavingSmtp ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}
                    {isSavingSmtp ? 'Guardando...' : 'Guardar Configuración en Servidor'}
                  </button>

                  <span className="text-xs text-slate-400 font-mono">
                    Puerto seguro: {smtpForm.port === 465 ? 'SSL (465)' : 'STARTTLS (587)'}
                  </span>
                </div>
              </form>
            </div>

            {/* Right 1 Col: Test Email & Gmail Guidance */}
            <div className="space-y-6">
              
              {/* Test Email Card */}
              <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-xl space-y-4">
                <h4 className="text-base font-bold text-white flex items-center gap-2">
                  <MailCheck className="text-blue-400" size={18} />
                  Probar Envío de Correo Ahora
                </h4>
                <p className="text-xs text-slate-400">
                  Envía un correo de verificación en tiempo real para confirmar que el servidor puede despachar mensajes con éxito.
                </p>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300">
                    Enviar prueba a:
                  </label>
                  <input
                    type="email"
                    value={testEmailTo}
                    onChange={(e) => setTestEmailTo(e.target.value)}
                    placeholder="tu-correo@gmail.com"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
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

              {/* Gmail App Password Helper */}
              <div className="bg-slate-900/60 rounded-3xl p-6 border border-slate-800 space-y-3">
                <h5 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <HelpCircle size={14} />
                  ¿Usas cuenta de Gmail?
                </h5>
                <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                  <p>
                    Google requiere una <strong>Contraseña de Aplicación de 16 caracteres</strong> en lugar de tu contraseña habitual:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-400 text-[11px]">
                    <li>Ve a <strong>myaccount.google.com/security</strong></li>
                    <li>Activa la <em>Verificación en 2 pasos</em></li>
                    <li>Busca <strong>Contraseñas de aplicaciones</strong></li>
                    <li>Crea una llamada "Calico Agentes" y copia el código de 16 letras en el campo Contraseña.</li>
                  </ol>
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

                    {/* Optional Subject & Body */}
                    <div className="space-y-2 pt-1">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Asunto personalizado (Opcional):
                        </label>
                        <input
                          type="text"
                          placeholder="Dejar vacío para asunto automático con fecha"
                          value={formSubject}
                          onChange={(e) => setFormSubject(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 text-xs placeholder:text-slate-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Notas / Mensaje en el cuerpo (Opcional):
                        </label>
                        <textarea
                          placeholder="ej. Favor de revisar y confirmar recepción del reporte antes de las 19hs."
                          value={formBody}
                          onChange={(e) => setFormBody(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 text-xs resize-none placeholder:text-slate-500"
                        />
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

      {/* MODAL: Live Execution Result & Email Dispatch */}
      {executionResult && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl max-w-xl w-full p-6 md:p-8 space-y-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setExecutionResult(null)}
              className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            >
              <X size={20} />
            </button>

            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40 shadow-lg shadow-emerald-500/10">
                <CheckCircle2 size={36} />
              </div>
              <h2 className="text-2xl font-bold text-white">
                ¡Archivo Generado y Descargado con Éxito!
              </h2>
              <p className="text-slate-400 text-xs">
                El agente <strong className="text-emerald-400">"{executionResult.agent.name}"</strong> procesó los datos y generó el archivo solicitado.
              </p>
            </div>

            {/* File info card */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="text-emerald-400" size={20} />
                  <span className="font-mono text-sm font-bold text-white">
                    {executionResult.fileResult.fileName}
                  </span>
                </div>
                <button
                  onClick={() => triggerBrowserDownload(executionResult.fileResult.blob, executionResult.fileResult.fileName)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-all"
                >
                  <Download size={13} /> Re-descargar
                </button>
              </div>

              <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800/80 text-xs font-mono text-slate-300">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Resumen del archivo:</p>
                {executionResult.fileResult.summaryText}
              </div>

              {/* Recipients section */}
              {executionResult.agent.recipients && executionResult.agent.recipients.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                    <Mail size={12} className="text-emerald-400" /> Destinatarios asignados:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {executionResult.agent.recipients.map((em, i) => (
                      <span key={i} className="px-2.5 py-0.5 bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded-lg">
                        {em}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              {executionResult.agent.recipients && executionResult.agent.recipients.length > 0 && (
                <button
                  onClick={() => triggerMailto(
                    executionResult.agent.recipients, 
                    executionResult.fileResult.emailSubject, 
                    executionResult.fileResult.emailBody
                  )}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <Mail size={18} />
                  Abrir Cliente de Correo con Destinatarios y Resumen
                </button>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => handleCopySummary(executionResult.fileResult.emailBody)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                >
                  {copiedSummary ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  {copiedSummary ? 'Copiado al portapapeles' : 'Copiar Resumen y Texto'}
                </button>

                <button
                  onClick={() => setExecutionResult(null)}
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all"
                >
                  Cerrar
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
