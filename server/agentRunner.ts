import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  addDoc, 
  serverTimestamp, 
  query, 
  where 
} from 'firebase/firestore';
import { generateAgentFile, AppDatasets } from '../src/utils/fileGenerators';
import { AgentSchedule, AgentLog } from '../src/types';

// Load Firebase Config
let db: any = null;

try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    console.log('[Server Agent Runner] Conectado a Firestore:', firebaseConfig.firestoreDatabaseId);
  } else {
    console.warn('[Server Agent Runner] No se encontró firebase-applet-config.json');
  }
} catch (err) {
  console.error('[Server Agent Runner] Error al inicializar Firestore:', err);
}

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName?: string;
  fromEmail?: string;
  is_active?: boolean;
}

// Memory cache for SMTP config with fallback to environment variables
let cachedSMTPConfig: SMTPConfig | null = null;
let lastSMTPFetchTime = 0;

export async function getSMTPConfig(): Promise<SMTPConfig> {
  const now = Date.now();
  // Refresh cache every 30 seconds
  if (cachedSMTPConfig && (now - lastSMTPFetchTime < 30000)) {
    return cachedSMTPConfig;
  }

  // 1. Try to read from Firestore
  if (db) {
    try {
      const docRef = doc(db, 'system_settings', 'smtp_config');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as SMTPConfig;
        if (data.host && data.user) {
          cachedSMTPConfig = data;
          lastSMTPFetchTime = now;
          return data;
        }
      }
    } catch (e) {
      console.warn('[Server Agent Runner] Error leyendo smtp_config de Firestore:', e);
    }
  }

  // 2. Fallback to process.env variables
  const envConfig: SMTPConfig = {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromName: process.env.SMTP_FROM ? process.env.SMTP_FROM.split('<')[0]?.trim() : 'Calico S.A. Automatizaciones',
    fromEmail: process.env.SMTP_USER || 'notificaciones@calico.com',
    is_active: !!(process.env.SMTP_HOST && process.env.SMTP_USER)
  };

  cachedSMTPConfig = envConfig;
  lastSMTPFetchTime = now;
  return envConfig;
}

export async function saveSMTPConfig(config: SMTPConfig): Promise<void> {
  cachedSMTPConfig = config;
  lastSMTPFetchTime = Date.now();
  if (db) {
    const docRef = doc(db, 'system_settings', 'smtp_config');
    await setDoc(docRef, {
      ...config,
      updated_at: new Date().toISOString()
    }, { merge: true });
    console.log('[Server Agent Runner] Configuración SMTP guardada con éxito.');
  }
}

export function createTransporter(config: SMTPConfig) {
  if (!config.host || !config.user || !config.pass) {
    throw new Error('Configuración SMTP incompleta. Ingrese Host, Usuario y Contraseña/App Password.');
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port || 587,
    secure: config.secure ?? (config.port === 465),
    auth: {
      user: config.user,
      pass: config.pass
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

export async function sendTestEmail(toEmail: string, customConfig?: Partial<SMTPConfig>) {
  const baseConfig = await getSMTPConfig();
  const config: SMTPConfig = { ...baseConfig, ...customConfig };

  const transporter = createTransporter(config);

  const senderAddress = config.fromName 
    ? `"${config.fromName}" <${config.fromEmail || config.user}>`
    : config.user;

  const mailOptions = {
    from: senderAddress,
    to: toEmail,
    subject: `✅ [PRUEBA EXITOSA] Servidor de Automatizaciones Calico S.A. - ${new Date().toLocaleTimeString('es-AR')}`,
    text: `Hola,\n\nEste es un correo de prueba enviado por el servidor autónomo 24/7 de Calico S.A.\n\nLa conexión SMTP con el servidor ${config.host} funciona correctamente y está lista para el envío de informes automáticos programados aunque la aplicación web esté cerrada.\n\nFecha y hora del servidor: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #e2e8f0; border-radius: 16px; border: 1px solid #1e293b;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #10b981; font-size: 22px; margin: 0;">Calico S.A. • Motor de Agentes 24/7</h1>
          <p style="color: #94a3b8; font-size: 14px; margin-top: 4px;">Prueba de Conectividad SMTP Exitosa</p>
        </div>
        <div style="background: #1e293b; padding: 20px; border-radius: 12px; border: 1px solid #334155; margin-bottom: 20px;">
          <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.5;">
            <strong>¡Excelente!</strong> El servidor en la nube ha establecido comunicación exitosa con el proveedor de correo (<strong>${config.host}</strong>).
          </p>
          <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #cbd5e1; line-height: 1.8;">
            <li><strong>Emisor:</strong> ${senderAddress}</li>
            <li><strong>Destinatario de Prueba:</strong> ${toEmail}</li>
            <li><strong>Hora de Servidor (Arg):</strong> ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</li>
            <li><strong>Modo Autónomo:</strong> Activo (los correos se enviarán puntualmente sin necesidad de tener la app abierta)</li>
          </ul>
        </div>
        <p style="font-size: 12px; color: #64748b; text-align: center; margin: 0;">
          Generado automáticamente por el servidor de Automatizaciones • Calico S.A.
        </p>
      </div>
    `
  };

  const result = await transporter.sendMail(mailOptions);
  return {
    success: true,
    messageId: result.messageId,
    message: `Correo de prueba enviado satisfactoriamente a ${toEmail}`
  };
}

export async function loadAllDatasets(): Promise<AppDatasets> {
  const datasets: AppDatasets = {
    records: [],
    savedReports: [],
    palletRecords: [],
    palletReports: [],
    cepasRecords: [],
    cepasReports: [],
    escorihuelaRecords: [],
    escorihuelaReports: [],
    laRuralRecords: [],
    laRuralReports: [],
    abastecimientos: []
  };

  if (!db) return datasets;

  try {
    const [
      abastSnap,
      recordsSnap,
      palletsSnap,
      cepasSnap,
      escorihuelaSnap,
      laRuralSnap,
      reportsSnap,
      palletReportsSnap,
      cepasReportsSnap,
      escorihuelaReportsSnap,
      laRuralReportsSnap
    ] = await Promise.all([
      getDocs(collection(db, 'abastecimientos')),
      getDocs(collection(db, 'records')),
      getDocs(collection(db, 'pallets')),
      getDocs(collection(db, 'cepas')),
      getDocs(collection(db, 'escorihuela')),
      getDocs(collection(db, 'la_rural')),
      getDocs(collection(db, 'reports')),
      getDocs(collection(db, 'pallet_reports')),
      getDocs(collection(db, 'cepas_reports')),
      getDocs(collection(db, 'escorihuela_reports')),
      getDocs(collection(db, 'la_rural_reports'))
    ]);

    datasets.abastecimientos = abastSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    datasets.records = recordsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    datasets.palletRecords = palletsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    datasets.cepasRecords = cepasSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    datasets.escorihuelaRecords = escorihuelaSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    datasets.laRuralRecords = laRuralSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    datasets.savedReports = reportsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    datasets.palletReports = palletReportsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    datasets.cepasReports = cepasReportsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    datasets.escorihuelaReports = escorihuelaReportsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    datasets.laRuralReports = laRuralReportsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  } catch (err) {
    console.error('[Server Agent Runner] Error cargando datasets de Firestore:', err);
  }

  return datasets;
}

export async function executeAgent(agentId: string, isManualTrigger = false) {
  if (!db) throw new Error('Firestore no está conectado en el servidor');

  let agentSnap = await getDoc(doc(db, 'agents', agentId));
  let collectionName = 'agents';
  if (!agentSnap.exists()) {
    agentSnap = await getDoc(doc(db, 'agent_schedules', agentId));
    collectionName = 'agent_schedules';
  }

  if (!agentSnap.exists()) {
    throw new Error(`Agente con ID "${agentId}" no encontrado.`);
  }

  const agent = { id: agentSnap.id, ...agentSnap.data() } as AgentSchedule;
  const datasets = await loadAllDatasets();

  console.log(`[Server Agent Runner] Ejecutando agente "${agent.name}" (${agent.file_type})...`);

  // Generate file
  const generated = generateAgentFile(agent, datasets);

  let emailSent = false;
  let emailErrorMsg: string | undefined = undefined;

  const recipients = agent.recipients || [];
  if (recipients.length > 0) {
    try {
      const smtpConfig = await getSMTPConfig();
      if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
        throw new Error('Servidor SMTP no configurado. Ingrese las credenciales en la pestaña de configuración del Agente.');
      }

      const transporter = createTransporter(smtpConfig);
      const senderAddress = smtpConfig.fromName 
        ? `"${smtpConfig.fromName}" <${smtpConfig.fromEmail || smtpConfig.user}>`
        : smtpConfig.user;

      const fileBuffer = generated.rawBytes 
        ? Buffer.from(generated.rawBytes) 
        : Buffer.from(await generated.blob.arrayBuffer());

      const mailOptions = {
        from: senderAddress,
        to: recipients.join(', '),
        subject: generated.emailSubject,
        text: generated.emailBody,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f1f5f9; border-radius: 16px; border: 1px solid #334155;">
            <div style="border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 20px;">
              <h2 style="color: #10b981; font-size: 20px; margin: 0;">Calico S.A. • Reporte Automatizado</h2>
              <p style="color: #94a3b8; font-size: 13px; margin: 4px 0 0 0;">Generado por el Agente Autónomo: <strong>${agent.name}</strong></p>
            </div>
            
            <div style="background: #1e293b; padding: 18px; border-radius: 12px; border: 1px solid #475569; margin-bottom: 20px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; color: #e2e8f0;">${generated.emailBody}</div>

            <div style="background: #022c22; padding: 14px 18px; border-radius: 10px; border: 1px solid #059669; margin-bottom: 20px;">
              <p style="color: #6ee7b7; font-size: 13px; margin: 0; font-weight: bold;">
                📎 Archivo adjunto: ${generated.fileName} (${(fileBuffer.length / 1024).toFixed(1)} KB)
              </p>
            </div>

            <p style="font-size: 11px; color: #64748b; margin: 0; text-align: center;">
              Este correo fue enviado de forma 100% autónoma por el servidor en la nube de Calico S.A.
            </p>
          </div>
        `,
        attachments: [
          {
            filename: generated.fileName,
            content: fileBuffer,
            contentType: generated.mimeType
          }
        ]
      };

      await transporter.sendMail(mailOptions);
      emailSent = true;
      console.log(`[Server Agent Runner] Correo enviado exitosamente a ${recipients.join(', ')}`);
    } catch (err: any) {
      console.error('[Server Agent Runner] Error enviando correo:', err);
      emailErrorMsg = err.message || String(err);
    }
  } else {
    console.log('[Server Agent Runner] No hay destinatarios configurados para este agente.');
  }

  // Create log in Firestore
  const logData = {
    agent_id: agent.id,
    agent_name: agent.name,
    file_type: agent.file_type,
    file_name: generated.fileName,
    item_count: generated.itemCount,
    recipients: recipients,
    status: emailErrorMsg ? 'error' : 'success',
    message: emailErrorMsg 
      ? `Error al enviar correo: ${emailErrorMsg}` 
      : (recipients.length > 0 ? `Archivo generado y enviado a ${recipients.length} destinatario(s).` : `Archivo generado en servidor.`),
    summary: generated.summaryText,
    error_details: emailErrorMsg || null,
    is_server_executed: true,
    is_manual_trigger: isManualTrigger,
    timestamp: serverTimestamp(),
    executed_at: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, 'agent_logs'), logData);
  } catch (e) {
    console.error('[Server Agent Runner] Error escribiendo en agent_logs:', e);
  }

  // Update agent status
  try {
    await updateDoc(doc(db, collectionName, agentId), {
      last_run_at: new Date().toISOString(),
      last_run_status: emailErrorMsg ? 'error' : 'success',
      total_runs: (agent.total_runs || 0) + 1
    });
  } catch (e) {
    console.error('[Server Agent Runner] Error actualizando agent doc:', e);
  }

  return {
    success: !emailErrorMsg,
    agentName: agent.name,
    fileName: generated.fileName,
    recipients,
    emailSent,
    error: emailErrorMsg,
    summary: generated.summaryText
  };
}

let isSchedulerRunning = false;
let lastCheckedTimeKey = '';

export function startBackgroundScheduler() {
  if (isSchedulerRunning) return;
  isSchedulerRunning = true;

  console.log('[Server Agent Runner] Iniciando motor de fondo 24/7 para ejecución de agentes...');

  // Check every 30 seconds
  setInterval(async () => {
    if (!db) return;

    try {
      const now = new Date();
      // Argentine timezone time parts
      const timeFormatter = new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const dateFormatter = new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });

      const currentTimeHM = timeFormatter.format(now); // e.g. "08:00"
      const currentDateStr = dateFormatter.format(now); // e.g. "21/08/2026"
      const timeKey = `${currentDateStr}_${currentTimeHM}`;

      if (lastCheckedTimeKey === timeKey) {
        return; // Already checked this minute
      }
      lastCheckedTimeKey = timeKey;

      // Extract day numbers
      const parts = currentDateStr.split('/');
      const currentDay = parseInt(parts[0], 10);
      const currentMonth = parseInt(parts[1], 10);
      const currentYear = parseInt(parts[2], 10);
      const currentDayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

      // Total days in current month (28, 29, 30, 31)
      const totalDaysInMonth = new Date(currentYear, currentMonth, 0).getDate();
      const isLastDayOfMonth = currentDay === totalDaysInMonth;

      // Query active agents from both possible collection names
      const [snap1, snap2] = await Promise.all([
        getDocs(collection(db, 'agents')),
        getDocs(collection(db, 'agent_schedules')).catch(() => ({ docs: [] } as any))
      ]);

      const allAgentDocs = [...snap1.docs, ...snap2.docs];

      for (const docSnap of allAgentDocs) {
        const agent = { id: docSnap.id, ...docSnap.data() } as AgentSchedule;

        // Check if active
        const isActive = agent.status ? agent.status === 'active' : (agent.is_active ?? true);
        if (!isActive) continue;

        // Check time match
        if (agent.time !== currentTimeHM) {
          continue;
        }

        // Check if agent already ran today in the last 2 minutes
        if (agent.last_run_at) {
          const lastRunDate = new Date(agent.last_run_at);
          const diffMs = Math.abs(now.getTime() - lastRunDate.getTime());
          if (diffMs < 90000) { // less than 90 seconds
            continue;
          }
        }

        let shouldRun = false;

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
            shouldRun = currentDay === 1 || currentDay === 16 || isLastDayOfMonth;
            break;
          case 'monthly_last_day':
            shouldRun = isLastDayOfMonth;
            break;
          case 'monthly': {
            const isLastDayConfigured = 
              agent.monthly_mode === 'last_day' || 
              agent.day_of_month === 'last_day' || 
              agent.day_of_month === 31 || 
              !agent.day_of_month;

            if (isLastDayConfigured) {
              shouldRun = isLastDayOfMonth;
            } else {
              const targetDayNum = Number(agent.day_of_month);
              if (targetDayNum >= totalDaysInMonth) {
                // If month has 30 days and agent was set to 31, run on last day (day 30)
                shouldRun = isLastDayOfMonth;
              } else {
                shouldRun = currentDay === targetDayNum;
              }
            }
            break;
          }
        }

        if (shouldRun) {
          console.log(`[Server Agent Runner] ¡Disparando agente programado "${agent.name}" a las ${currentTimeHM}!`);
          executeAgent(agent.id, false).catch(err => {
            console.error(`[Server Agent Runner] Error ejecutando agente "${agent.name}":`, err);
          });
        }
      }
    } catch (err) {
      console.error('[Server Agent Runner] Error en tick del scheduler:', err);
    }
  }, 30000);
}
