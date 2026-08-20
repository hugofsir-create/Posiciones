import * as XLSX from 'xlsx';
import { format, subDays, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  StockRecord, 
  PalletRecord, 
  CepasRecord, 
  EscorihuelaRecord, 
  LaRuralRecord, 
  AbastecimientoRecord,
  SavedReport,
  PalletReport,
  CepasReport,
  EscorihuelaReport,
  LaRuralReport,
  AgentDatePreset,
  AgentFileType,
  AgentSchedule
} from '../types';

export interface GeneratedFileResult {
  fileName: string;
  blob: Blob;
  mimeType: string;
  itemCount: number;
  summaryText: string;
  emailSubject: string;
  emailBody: string;
}

export interface AppDatasets {
  records: StockRecord[];
  savedReports: SavedReport[];
  palletRecords: PalletRecord[];
  palletReports: PalletReport[];
  cepasRecords: CepasRecord[];
  cepasReports: CepasReport[];
  escorihuelaRecords: EscorihuelaRecord[];
  escorihuelaReports: EscorihuelaReport[];
  laRuralRecords: LaRuralRecord[];
  laRuralReports: LaRuralReport[];
  abastecimientos: AbastecimientoRecord[];
}

function filterByDatePreset<T extends { date: string }>(items: T[], preset: AgentDatePreset): T[] {
  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');

  switch (preset) {
    case 'today':
      return items.filter(i => i.date === todayStr);
    case 'last_7_days': {
      const start = subDays(now, 7);
      return items.filter(i => {
        try {
          const d = parseISO(i.date);
          return isWithinInterval(d, { start, end: now });
        } catch {
          return false;
        }
      });
    }
    case 'current_fortnight': {
      const monthStart = startOfMonth(now);
      const isFirstHalf = now.getDate() <= 15;
      const start = isFirstHalf ? monthStart : new Date(now.getFullYear(), now.getMonth(), 16);
      const end = isFirstHalf ? new Date(now.getFullYear(), now.getMonth(), 15) : endOfMonth(now);
      return items.filter(i => {
        try {
          const d = parseISO(i.date);
          return isWithinInterval(d, { start, end });
        } catch {
          return false;
        }
      });
    }
    case 'current_month': {
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      return items.filter(i => {
        try {
          const d = parseISO(i.date);
          return isWithinInterval(d, { start, end });
        } catch {
          return false;
        }
      });
    }
    case 'all':
    default:
      return items;
  }
}

export function generateAgentFile(agent: AgentSchedule, datasets: AppDatasets): GeneratedFileResult {
  const timestampStr = format(new Date(), 'yyyy-MM-dd_HHmm');
  const dateLabel = format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es });

  switch (agent.file_type) {
    case 'abastecimientos': {
      const filtered = filterByDatePreset(datasets.abastecimientos, agent.date_range_preset);
      let totalIngresos = 0;
      let totalEgresos = 0;
      let totalArlog = 0;
      let totalDescartables = 0;
      let totalRotos = 0;

      const dataToExport = filtered.map(record => {
        const isEgreso = (record.type || 'ingreso') === 'egreso';
        const arlog = record.pallets_arlog ?? record.pallets;
        const desc = record.pallets_descartables ?? 0;
        const rotos = record.pallets_rotos ?? 0;

        if (isEgreso) {
          totalEgresos += record.pallets;
        } else {
          totalIngresos += record.pallets;
        }
        totalArlog += isEgreso ? -arlog : arlog;
        totalDescartables += isEgreso ? -desc : desc;
        totalRotos += isEgreso ? -rotos : rotos;

        return {
          'Tipo Movimiento': isEgreso ? 'Salida / Devolución' : 'Ingreso / Entrada',
          'Fecha': record.date,
          'Cliente': record.client,
          'Número de Remito': record.remito,
          'Pallets Arlog': arlog,
          'Pallets Descartables': desc,
          'Pallets Rotos': rotos,
          'Total Pallets': record.pallets,
          'Saldo Impacto': isEgreso ? -record.pallets : record.pallets
        };
      });

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Movimientos Abastecimiento");

      // Summary sheet
      const summaryData = [
        ["REPORTE AUTOMATIZADO DE ABASTECIMIENTO DE PALLETS"],
        ["Generado por Agente:", agent.name],
        ["Fecha de Ejecución:", dateLabel],
        ["Filtro de Período:", agent.date_range_preset],
        ["Total Registros:", filtered.length],
        [],
        ["ESTADO GLOBAL DE STOCK"],
        ["Total Pallets Ingresados:", totalIngresos],
        ["Total Pallets Egresados / Devueltos:", totalEgresos],
        ["Saldo Neto Total en Poder:", totalIngresos - totalEgresos],
        [],
        ["DESGLOSE POR TIPO DE PALLET"],
        ["Stock Pallets Arlog (Estándar):", totalArlog],
        ["Stock Pallets Descartables:", totalDescartables],
        ["Stock Pallets Rotos:", totalRotos]
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen General");

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `Reporte_Abastecimientos_${timestampStr}.xlsx`;

      const summaryText = `${filtered.length} movimientos de abastecimiento. Saldo neto: ${totalIngresos - totalEgresos} pallets (Arlog: ${totalArlog}, Descartables: ${totalDescartables}, Rotos: ${totalRotos}).`;
      const emailSubject = agent.email_subject || `[AUTOMÁTICO] Reporte de Abastecimiento de Pallets - ${dateLabel}`;
      const emailBody = [
        `Estimados,`,
        ``,
        `Se adjunta el reporte automático de Abastecimientos y Movimientos de Pallets generado por el Agente "${agent.name}".`,
        ``,
        `📊 Resumen del Reporte:`,
        `• Período evaluado: ${agent.date_range_preset}`,
        `• Registros procesados: ${filtered.length}`,
        `• Ingresos acumulados: ${totalIngresos} pallets`,
        `• Egresos / Devoluciones: ${totalEgresos} pallets`,
        `• Saldo neto en stock: ${totalIngresos - totalEgresos} pallets`,
        `  - Pallets Arlog: ${totalArlog}`,
        `  - Pallets Descartables: ${totalDescartables}`,
        `  - Pallets Rotos: ${totalRotos}`,
        ``,
        agent.email_body ? `Notas adicionales:\n${agent.email_body}\n\n` : '',
        `Archivo generado: ${fileName}`,
        `Sistema: Calico S.A. - Stock & Abastecimiento Pro`
      ].filter(Boolean).join('\n');

      return {
        fileName,
        blob,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        itemCount: filtered.length,
        summaryText,
        emailSubject,
        emailBody
      };
    }

    case 'kilos': {
      const filtered = filterByDatePreset(datasets.records, agent.date_range_preset);
      const totalKilos = filtered.reduce((sum, r) => sum + r.kilos, 0);
      const avgKilos = filtered.length > 0 ? totalKilos / filtered.length : 0;

      const dataToExport = filtered.map(r => ({
        'Fecha': r.date,
        'Kilos': r.kilos,
        'Estado': 'Registrado'
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Stock Kilos Raizen");

      XLSX.utils.sheet_add_aoa(ws, [
        [],
        ["Resumen de Stock"],
        ["Total Kilos Acumulados:", totalKilos.toLocaleString('es-AR') + " kg"],
        ["Promedio Diario:", avgKilos.toFixed(2) + " kg"]
      ], { origin: -1 });

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `Reporte_Stock_Kilos_${timestampStr}.xlsx`;
      const summaryText = `${filtered.length} días de stock de kilos. Total: ${totalKilos.toLocaleString('es-AR')} kg (Promedio diario: ${avgKilos.toFixed(1)} kg).`;
      const emailSubject = agent.email_subject || `[AUTOMÁTICO] Reporte Stock Diario Kilos - ${dateLabel}`;
      const emailBody = `Estimados,\n\nSe adjunta el reporte de stock diario de kilos generado automáticamente por el Agente "${agent.name}".\n\n• Total Kilos: ${totalKilos.toLocaleString('es-AR')} kg\n• Promedio Diario: ${avgKilos.toFixed(2)} kg\n• Total Días: ${filtered.length}\n\n${agent.email_body ? agent.email_body + '\n\n' : ''}Archivo: ${fileName}\nCalico S.A.`;

      return {
        fileName,
        blob,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        itemCount: filtered.length,
        summaryText,
        emailSubject,
        emailBody
      };
    }

    case 'bianchi': {
      const filtered = filterByDatePreset(datasets.palletRecords, agent.date_range_preset);
      const totalPos = filtered.reduce((sum, r) => sum + r.positions, 0);
      const avgPos = filtered.length > 0 ? totalPos / filtered.length : 0;

      const dataToExport = filtered.map(r => ({
        'Fecha': r.date,
        'Posiciones Pallets': r.positions
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Posiciones Bianchi");

      XLSX.utils.sheet_add_aoa(ws, [
        [],
        ["Resumen Bodegas Bianchi"],
        ["Total Posiciones Acumuladas:", totalPos],
        ["Promedio Diario:", avgPos.toFixed(2)]
      ], { origin: -1 });

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `Reporte_Bianchi_Posiciones_${timestampStr}.xlsx`;
      const summaryText = `${filtered.length} días de posiciones Bodegas Bianchi. Promedio: ${avgPos.toFixed(1)} posiciones.`;
      const emailSubject = agent.email_subject || `[AUTOMÁTICO] Reporte Posiciones Bianchi - ${dateLabel}`;
      const emailBody = `Estimados,\n\nSe adjunta el reporte de Posiciones Bodegas Bianchi generado automáticamente por el Agente "${agent.name}".\n\n• Promedio Diario: ${avgPos.toFixed(2)} posiciones\n• Días Registrados: ${filtered.length}\n\n${agent.email_body ? agent.email_body + '\n\n' : ''}Archivo: ${fileName}\nCalico S.A.`;

      return {
        fileName,
        blob,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        itemCount: filtered.length,
        summaryText,
        emailSubject,
        emailBody
      };
    }

    case 'cepas': {
      const filtered = filterByDatePreset(datasets.cepasRecords, agent.date_range_preset);
      const totalPos = filtered.reduce((sum, r) => sum + r.positions, 0);
      const avgPos = filtered.length > 0 ? totalPos / filtered.length : 0;

      const dataToExport = filtered.map(r => ({
        'Fecha': r.date,
        'Posiciones': r.positions
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Posiciones Cepas");

      XLSX.utils.sheet_add_aoa(ws, [
        [],
        ["Resumen Cepas"],
        ["Total Posiciones:", totalPos],
        ["Promedio Diario:", avgPos.toFixed(2)]
      ], { origin: -1 });

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `Reporte_Cepas_Posiciones_${timestampStr}.xlsx`;
      const summaryText = `${filtered.length} días de posiciones Cepas. Promedio: ${avgPos.toFixed(1)} posiciones.`;
      const emailSubject = agent.email_subject || `[AUTOMÁTICO] Reporte Posiciones Cepas - ${dateLabel}`;
      const emailBody = `Estimados,\n\nSe adjunta el reporte de Posiciones Cepas generado automáticamente por el Agente "${agent.name}".\n\n• Promedio Diario: ${avgPos.toFixed(2)} posiciones\n• Días Registrados: ${filtered.length}\n\n${agent.email_body ? agent.email_body + '\n\n' : ''}Archivo: ${fileName}\nCalico S.A.`;

      return {
        fileName,
        blob,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        itemCount: filtered.length,
        summaryText,
        emailSubject,
        emailBody
      };
    }

    case 'escorihuela': {
      const filtered = filterByDatePreset(datasets.escorihuelaRecords, agent.date_range_preset);
      const totalPos = filtered.reduce((sum, r) => sum + r.positions, 0);
      const avgPos = filtered.length > 0 ? totalPos / filtered.length : 0;

      const dataToExport = filtered.map(r => ({
        'Fecha': r.date,
        'Posiciones': r.positions
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Posiciones Escorihuela");

      XLSX.utils.sheet_add_aoa(ws, [
        [],
        ["Resumen Escorihuela Gascón"],
        ["Total Posiciones:", totalPos],
        ["Promedio Diario:", avgPos.toFixed(2)]
      ], { origin: -1 });

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `Reporte_Escorihuela_Posiciones_${timestampStr}.xlsx`;
      const summaryText = `${filtered.length} días de posiciones Escorihuela Gascón. Promedio: ${avgPos.toFixed(1)} posiciones.`;
      const emailSubject = agent.email_subject || `[AUTOMÁTICO] Reporte Posiciones Escorihuela Gascón - ${dateLabel}`;
      const emailBody = `Estimados,\n\nSe adjunta el reporte de Posiciones Escorihuela Gascón generado automáticamente por el Agente "${agent.name}".\n\n• Promedio Diario: ${avgPos.toFixed(2)} posiciones\n• Días Registrados: ${filtered.length}\n\n${agent.email_body ? agent.email_body + '\n\n' : ''}Archivo: ${fileName}\nCalico S.A.`;

      return {
        fileName,
        blob,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        itemCount: filtered.length,
        summaryText,
        emailSubject,
        emailBody
      };
    }

    case 'la_rural': {
      const filtered = filterByDatePreset(datasets.laRuralRecords, agent.date_range_preset);
      const totalPos = filtered.reduce((sum, r) => sum + r.positions, 0);
      const avgPos = filtered.length > 0 ? totalPos / filtered.length : 0;

      const dataToExport = filtered.map(r => ({
        'Fecha': r.date,
        'Posiciones': r.positions
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Posiciones La Rural");

      XLSX.utils.sheet_add_aoa(ws, [
        [],
        ["Resumen La Rural (Rutini Wines)"],
        ["Total Posiciones:", totalPos],
        ["Promedio Diario:", avgPos.toFixed(2)]
      ], { origin: -1 });

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `Reporte_LaRural_Posiciones_${timestampStr}.xlsx`;
      const summaryText = `${filtered.length} días de posiciones La Rural (Rutini Wines). Promedio: ${avgPos.toFixed(1)} posiciones.`;
      const emailSubject = agent.email_subject || `[AUTOMÁTICO] Reporte Posiciones La Rural (Rutini Wines) - ${dateLabel}`;
      const emailBody = `Estimados,\n\nSe adjunta el reporte de Posiciones La Rural (Rutini Wines) generado automáticamente por el Agente "${agent.name}".\n\n• Promedio Diario: ${avgPos.toFixed(2)} posiciones\n• Días Registrados: ${filtered.length}\n\n${agent.email_body ? agent.email_body + '\n\n' : ''}Archivo: ${fileName}\nCalico S.A.`;

      return {
        fileName,
        blob,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        itemCount: filtered.length,
        summaryText,
        emailSubject,
        emailBody
      };
    }

    case 'consolidado': {
      // Multi-sheet workbook with everything!
      const wb = XLSX.utils.book_new();

      // 1. Resumen Ejecutivo
      const totalAbast = datasets.abastecimientos.length;
      const totalKilos = datasets.records.reduce((acc, r) => acc + r.kilos, 0);
      const lastBianchi = datasets.palletRecords[0]?.positions || 0;
      const lastCepas = datasets.cepasRecords[0]?.positions || 0;
      const lastEscorihuela = datasets.escorihuelaRecords[0]?.positions || 0;
      const lastLaRural = datasets.laRuralRecords[0]?.positions || 0;

      const summaryRows = [
        ["CALICO S.A. - REPORTE CONSOLIDADO INTEGRAL DE OPERACIONES"],
        ["Generado por Agente:", agent.name],
        ["Fecha de Generación:", dateLabel],
        [],
        ["RESUMEN DE CLIENTES Y BODEGAS", "ÚLTIMA POSICIÓN / TOTAL"],
        ["Bodegas Bianchi (Últimas Posiciones):", lastBianchi],
        ["Cepas (Últimas Posiciones):", lastCepas],
        ["Escorihuela Gascón (Últimas Posiciones):", lastEscorihuela],
        ["La Rural - Rutini Wines (Últimas Posiciones):", lastLaRural],
        ["Raizen (Kilos Totales Acumulados):", totalKilos],
        ["Total Movimientos Abastecimiento:", totalAbast]
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Consolidado General");

      // 2. Abastecimientos
      if (datasets.abastecimientos.length > 0) {
        const abastData = datasets.abastecimientos.map(r => ({
          'Tipo': (r.type || 'ingreso') === 'egreso' ? 'Salida' : 'Ingreso',
          'Fecha': r.date,
          'Cliente': r.client,
          'Remito': r.remito,
          'Pallets Arlog': r.pallets_arlog ?? r.pallets,
          'Pallets Descartables': r.pallets_descartables ?? 0,
          'Pallets Rotos': r.pallets_rotos ?? 0,
          'Total Pallets': r.pallets
        }));
        const wsAbast = XLSX.utils.json_to_sheet(abastData);
        XLSX.utils.book_append_sheet(wb, wsAbast, "Abastecimientos");
      }

      // 3. Raizen Kilos
      if (datasets.records.length > 0) {
        const wsKilos = XLSX.utils.json_to_sheet(datasets.records.map(r => ({ 'Fecha': r.date, 'Kilos': r.kilos })));
        XLSX.utils.book_append_sheet(wb, wsKilos, "Stock Kilos Raizen");
      }

      // 4. Bianchi
      if (datasets.palletRecords.length > 0) {
        const wsBianchi = XLSX.utils.json_to_sheet(datasets.palletRecords.map(r => ({ 'Fecha': r.date, 'Posiciones': r.positions })));
        XLSX.utils.book_append_sheet(wb, wsBianchi, "Bianchi");
      }

      // 5. Cepas
      if (datasets.cepasRecords.length > 0) {
        const wsCepas = XLSX.utils.json_to_sheet(datasets.cepasRecords.map(r => ({ 'Fecha': r.date, 'Posiciones': r.positions })));
        XLSX.utils.book_append_sheet(wb, wsCepas, "Cepas");
      }

      // 6. Escorihuela
      if (datasets.escorihuelaRecords.length > 0) {
        const wsEscorihuela = XLSX.utils.json_to_sheet(datasets.escorihuelaRecords.map(r => ({ 'Fecha': r.date, 'Posiciones': r.positions })));
        XLSX.utils.book_append_sheet(wb, wsEscorihuela, "Escorihuela");
      }

      // 7. La Rural
      if (datasets.laRuralRecords.length > 0) {
        const wsLaRural = XLSX.utils.json_to_sheet(datasets.laRuralRecords.map(r => ({ 'Fecha': r.date, 'Posiciones': r.positions })));
        XLSX.utils.book_append_sheet(wb, wsLaRural, "La Rural");
      }

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `Reporte_Consolidado_Integral_${timestampStr}.xlsx`;
      const totalItems = datasets.records.length + datasets.palletRecords.length + datasets.cepasRecords.length + datasets.escorihuelaRecords.length + datasets.laRuralRecords.length + datasets.abastecimientos.length;
      const summaryText = `Reporte Consolidado Integral con todas las bodegas, stock y movimientos (${totalItems} registros totales).`;
      const emailSubject = agent.email_subject || `[AUTOMÁTICO] Consolidado Integral de Operaciones y Stock - ${dateLabel}`;
      const emailBody = `Estimados,\n\nSe adjunta el reporte Consolidado Integral con la información unificada de todas las bodegas, posiciones de stock y movimientos de abastecimiento.\n\n• Bodegas Bianchi (Últimas Posiciones): ${lastBianchi}\n• Cepas (Últimas Posiciones): ${lastCepas}\n• Escorihuela Gascón (Últimas Posiciones): ${lastEscorihuela}\n• La Rural (Últimas Posiciones): ${lastLaRural}\n• Total Kilos Raizen: ${totalKilos.toLocaleString('es-AR')} kg\n• Movimientos de Abastecimiento: ${totalAbast}\n\n${agent.email_body ? agent.email_body + '\n\n' : ''}Archivo: ${fileName}\nCalico S.A. - Logística Integral`;

      return {
        fileName,
        blob,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        itemCount: totalItems,
        summaryText,
        emailSubject,
        emailBody
      };
    }

    case 'backup':
    default: {
      const backupData = {
        ...datasets,
        version: '1.0',
        exportedAt: new Date().toISOString(),
        agentName: agent.name
      };
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const fileName = `Backup_Completo_Sistema_${timestampStr}.json`;
      const totalItems = datasets.records.length + datasets.palletRecords.length + datasets.cepasRecords.length + datasets.escorihuelaRecords.length + datasets.laRuralRecords.length + datasets.abastecimientos.length;
      const summaryText = `Copia de seguridad completa en formato JSON (${totalItems} registros totales).`;
      const emailSubject = agent.email_subject || `[AUTOMÁTICO] Copia de Seguridad del Sistema - ${dateLabel}`;
      const emailBody = `Estimados,\n\nSe ha generado la copia de seguridad integral (Backup JSON) de la base de datos de Calico S.A.\n\nTotal de registros respaldados: ${totalItems}\n\n${agent.email_body ? agent.email_body + '\n\n' : ''}Archivo: ${fileName}`;

      return {
        fileName,
        blob,
        mimeType: 'application/json',
        itemCount: totalItems,
        summaryText,
        emailSubject,
        emailBody
      };
    }
  }
}

export function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function triggerMailto(recipients: string[], subject: string, body: string) {
  const to = recipients.join(',');
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);
  const mailtoUrl = `mailto:${to}?subject=${encodedSubject}&body=${encodedBody}`;
  window.open(mailtoUrl, '_blank');
}

export function playSuccessChime() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
    osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.2); // D6

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch (e) {
    // Audio might be blocked by browser autoplay policy if no user interaction yet
  }
}
