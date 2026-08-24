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
  rawBytes?: Uint8Array;
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

export function formatReportDate(dateStr: string): { fechaFormatted: string; diaNombre: string } {
  if (!dateStr) return { fechaFormatted: '', diaNombre: '' };
  try {
    let d: Date;
    if (dateStr.includes('-')) {
      const parts = dateStr.split('-').map(Number);
      if (parts[0] > 1000) {
        d = new Date(parts[0], parts[1] - 1, parts[2]);
      } else {
        d = new Date(parts[2], parts[1] - 1, parts[0]);
      }
    } else if (dateStr.includes('/')) {
      const parts = dateStr.split('/').map(Number);
      if (parts[0] > 1000) {
        d = new Date(parts[0], parts[1] - 1, parts[2]);
      } else {
        d = new Date(parts[2], parts[1] - 1, parts[0]);
      }
    } else {
      d = parseISO(dateStr);
    }

    if (isNaN(d.getTime())) {
      return { fechaFormatted: dateStr, diaNombre: '' };
    }

    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const aaaa = String(d.getFullYear());
    
    // Formato exacto solicitado: dd, mm, aaaa
    const fechaFormatted = `${dd}, ${mm}, ${aaaa}`;

    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaNombre = dias[d.getDay()] || '';

    return {
      fechaFormatted,
      diaNombre
    };
  } catch {
    return {
      fechaFormatted: dateStr,
      diaNombre: ''
    };
  }
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

export function getDefaultEmailBodyForType(fileType: AgentFileType, clientName = ''): string {
  switch (fileType) {
    case 'bianchi':
      return `Estimados,\n\nComparto el fijo semanal de Bodegas Bianchi.\n\nSaludos cordiales,\nCalico S.A.`;
    case 'cepas':
      return `Estimados,\n\nComparto el reporte de posiciones de Cepas.\n\nSaludos cordiales,\nCalico S.A.`;
    case 'escorihuela':
      return `Estimados,\n\nComparto el reporte de posiciones de Escorihuela Gascón.\n\nSaludos cordiales,\nCalico S.A.`;
    case 'la_rural':
      return `Estimados,\n\nComparto el reporte de posiciones de La Rural (Rutini Wines).\n\nSaludos cordiales,\nCalico S.A.`;
    case 'kilos':
      return `Estimados,\n\nComparto el reporte de stock diario de kilos de Raizen.\n\nSaludos cordiales,\nCalico S.A.`;
    case 'abastecimientos':
      return `Estimados,\n\nComparto el reporte de abastecimientos y movimientos de pallets.\n\nSaludos cordiales,\nCalico S.A.`;
    case 'consolidado':
      return `Estimados,\n\nComparto el reporte consolidado integral de operaciones y stock.\n\nSaludos cordiales,\nCalico S.A.`;
    default:
      return `Estimados,\n\nComparto el reporte de ${clientName || 'operaciones'}.\n\nSaludos cordiales,\nCalico S.A.`;
  }
}

export function formatEmailBody(
  agent: AgentSchedule,
  defaultIntro: string,
  metricsText: string,
  fileName: string
): string {
  // If the agent has a customized email body, respect the user's customized message
  if (agent.email_body && agent.email_body.trim().length > 0) {
    let custom = agent.email_body.trim();
    custom = custom
      .replace(/\{archivo\}/gi, fileName)
      .replace(/\{agente\}/gi, agent.name)
      .replace(/\{periodo\}/gi, agent.date_range_preset)
      .replace(/\{resumen\}/gi, metricsText);

    // If user's custom message doesn't have the metrics or filename, append cleanly
    if (!custom.includes(fileName) && !custom.includes('Archivo:')) {
      const parts = [
        custom,
        metricsText ? `\n${metricsText}` : '',
        `\nArchivo adjunto: ${fileName}`
      ].filter(Boolean);
      return parts.join('\n');
    }
    return custom;
  }

  // Standard clean email without robotic automated agent boilerplate
  const parts = [
    `Estimados,`,
    ``,
    defaultIntro,
    metricsText ? `\n${metricsText}` : '',
    ``,
    `Archivo adjunto: ${fileName}`,
    `Calico S.A.`
  ].filter(p => p !== undefined);

  return parts.join('\n');
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
        const { fechaFormatted, diaNombre } = formatReportDate(record.date);

        if (isEgreso) {
          totalEgresos += record.pallets;
        } else {
          totalIngresos += record.pallets;
        }
        totalArlog += isEgreso ? -arlog : arlog;
        totalDescartables += isEgreso ? -desc : desc;
        totalRotos += isEgreso ? -rotos : rotos;

        return {
          'Fecha': fechaFormatted,
          'Día': diaNombre,
          'Cantidad': record.pallets,
          'Tipo Movimiento': isEgreso ? 'Salida / Devolución' : 'Ingreso / Entrada',
          'Cliente': record.client,
          'Número de Remito': record.remito,
          'Pallets Arlog': arlog,
          'Pallets Descartables': desc,
          'Pallets Rotos': rotos,
          'Saldo Impacto': isEgreso ? -record.pallets : record.pallets
        };
      });

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Movimientos Abastecimiento");

      // Summary sheet
      const summaryData = [
        ["REPORTE DE ABASTECIMIENTO DE PALLETS"],
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
      const rawBytes = new Uint8Array(wbout as ArrayBuffer);
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `Reporte_Abastecimientos_${timestampStr}.xlsx`;

      const summaryText = `${filtered.length} movimientos de abastecimiento. Saldo neto: ${totalIngresos - totalEgresos} pallets (Arlog: ${totalArlog}, Descartables: ${totalDescartables}, Rotos: ${totalRotos}).`;
      const emailSubject = agent.email_subject || `Reporte de Abastecimiento de Pallets - ${dateLabel}`;
      const metricsText = [
        `📊 Resumen del Reporte:`,
        `• Período evaluado: ${agent.date_range_preset}`,
        `• Registros procesados: ${filtered.length}`,
        `• Ingresos acumulados: ${totalIngresos} pallets`,
        `• Egresos / Devoluciones: ${totalEgresos} pallets`,
        `• Saldo neto en stock: ${totalIngresos - totalEgresos} pallets`,
        `  - Pallets Arlog: ${totalArlog}`,
        `  - Pallets Descartables: ${totalDescartables}`,
        `  - Pallets Rotos: ${totalRotos}`
      ].join('\n');

      const emailBody = formatEmailBody(
        agent,
        `Comparto el reporte de abastecimientos y movimientos de pallets.`,
        metricsText,
        fileName
      );

      return {
        fileName,
        blob,
        rawBytes,
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

      const dataToExport = filtered.map(r => {
        const { fechaFormatted, diaNombre } = formatReportDate(r.date);
        return {
          'Fecha': fechaFormatted,
          'Día': diaNombre,
          'Cantidad': r.kilos,
          'Estado': 'Registrado'
        };
      });

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
      const rawBytes = new Uint8Array(wbout as ArrayBuffer);
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `Reporte_Stock_Kilos_${timestampStr}.xlsx`;
      const summaryText = `${filtered.length} días de stock de kilos. Total: ${totalKilos.toLocaleString('es-AR')} kg (Promedio diario: ${avgKilos.toFixed(1)} kg).`;
      const emailSubject = agent.email_subject || `Reporte Stock Diario Kilos - ${dateLabel}`;
      const metricsText = `• Total Kilos: ${totalKilos.toLocaleString('es-AR')} kg\n• Promedio Diario: ${avgKilos.toFixed(2)} kg\n• Total Días: ${filtered.length}`;
      const emailBody = formatEmailBody(
        agent,
        `Comparto el reporte de stock diario de kilos de Raizen.`,
        metricsText,
        fileName
      );

      return {
        fileName,
        blob,
        rawBytes,
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

      const dataToExport = filtered.map(r => {
        const { fechaFormatted, diaNombre } = formatReportDate(r.date);
        return {
          'Fecha': fechaFormatted,
          'Día': diaNombre,
          'Cantidad': r.positions
        };
      });

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
      const rawBytes = new Uint8Array(wbout as ArrayBuffer);
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `Reporte_Bianchi_Posiciones_${timestampStr}.xlsx`;
      const summaryText = `${filtered.length} días de posiciones Bodegas Bianchi. Promedio: ${avgPos.toFixed(1)} posiciones.`;
      const emailSubject = agent.email_subject || `Reporte Posiciones Bianchi - ${dateLabel}`;
      const metricsText = `• Promedio Diario: ${avgPos.toFixed(2)} posiciones\n• Días Registrados: ${filtered.length}`;
      const emailBody = formatEmailBody(
        agent,
        `Comparto el fijo semanal de Bodegas Bianchi.`,
        metricsText,
        fileName
      );

      return {
        fileName,
        blob,
        rawBytes,
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

      const dataToExport = filtered.map(r => {
        const { fechaFormatted, diaNombre } = formatReportDate(r.date);
        return {
          'Fecha': fechaFormatted,
          'Día': diaNombre,
          'Cantidad': r.positions
        };
      });

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
      const rawBytes = new Uint8Array(wbout as ArrayBuffer);
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `Reporte_Cepas_Posiciones_${timestampStr}.xlsx`;
      const summaryText = `${filtered.length} días de posiciones Cepas. Promedio: ${avgPos.toFixed(1)} posiciones.`;
      const emailSubject = agent.email_subject || `Reporte Posiciones Cepas - ${dateLabel}`;
      const metricsText = `• Promedio Diario: ${avgPos.toFixed(2)} posiciones\n• Días Registrados: ${filtered.length}`;
      const emailBody = formatEmailBody(
        agent,
        `Comparto el reporte de posiciones de Cepas.`,
        metricsText,
        fileName
      );

      return {
        fileName,
        blob,
        rawBytes,
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

      const dataToExport = filtered.map(r => {
        const { fechaFormatted, diaNombre } = formatReportDate(r.date);
        return {
          'Fecha': fechaFormatted,
          'Día': diaNombre,
          'Cantidad': r.positions
        };
      });

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
      const rawBytes = new Uint8Array(wbout as ArrayBuffer);
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `Reporte_Escorihuela_Posiciones_${timestampStr}.xlsx`;
      const summaryText = `${filtered.length} días de posiciones Escorihuela Gascón. Promedio: ${avgPos.toFixed(1)} posiciones.`;
      const emailSubject = agent.email_subject || `Reporte Posiciones Escorihuela Gascón - ${dateLabel}`;
      const metricsText = `• Promedio Diario: ${avgPos.toFixed(2)} posiciones\n• Días Registrados: ${filtered.length}`;
      const emailBody = formatEmailBody(
        agent,
        `Comparto el reporte de posiciones de Escorihuela Gascón.`,
        metricsText,
        fileName
      );

      return {
        fileName,
        blob,
        rawBytes,
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

      const dataToExport = filtered.map(r => {
        const { fechaFormatted, diaNombre } = formatReportDate(r.date);
        return {
          'Fecha': fechaFormatted,
          'Día': diaNombre,
          'Cantidad': r.positions
        };
      });

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
      const rawBytes = new Uint8Array(wbout as ArrayBuffer);
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `Reporte_LaRural_Posiciones_${timestampStr}.xlsx`;
      const summaryText = `${filtered.length} días de posiciones La Rural (Rutini Wines). Promedio: ${avgPos.toFixed(1)} posiciones.`;
      const emailSubject = agent.email_subject || `Reporte Posiciones La Rural (Rutini Wines) - ${dateLabel}`;
      const metricsText = `• Promedio Diario: ${avgPos.toFixed(2)} posiciones\n• Días Registrados: ${filtered.length}`;
      const emailBody = formatEmailBody(
        agent,
        `Comparto el reporte de posiciones de La Rural (Rutini Wines).`,
        metricsText,
        fileName
      );

      return {
        fileName,
        blob,
        rawBytes,
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
        const abastData = datasets.abastecimientos.map(r => {
          const { fechaFormatted, diaNombre } = formatReportDate(r.date);
          return {
            'Fecha': fechaFormatted,
            'Día': diaNombre,
            'Cantidad': r.pallets,
            'Tipo': (r.type || 'ingreso') === 'egreso' ? 'Salida' : 'Ingreso',
            'Cliente': r.client,
            'Remito': r.remito,
            'Pallets Arlog': r.pallets_arlog ?? r.pallets,
            'Pallets Descartables': r.pallets_descartables ?? 0,
            'Pallets Rotos': r.pallets_rotos ?? 0
          };
        });
        const wsAbast = XLSX.utils.json_to_sheet(abastData);
        XLSX.utils.book_append_sheet(wb, wsAbast, "Abastecimientos");
      }

      // 3. Raizen Kilos
      if (datasets.records.length > 0) {
        const wsKilos = XLSX.utils.json_to_sheet(datasets.records.map(r => {
          const { fechaFormatted, diaNombre } = formatReportDate(r.date);
          return {
            'Fecha': fechaFormatted,
            'Día': diaNombre,
            'Cantidad': r.kilos
          };
        }));
        XLSX.utils.book_append_sheet(wb, wsKilos, "Stock Kilos Raizen");
      }

      // 4. Bianchi
      if (datasets.palletRecords.length > 0) {
        const wsBianchi = XLSX.utils.json_to_sheet(datasets.palletRecords.map(r => {
          const { fechaFormatted, diaNombre } = formatReportDate(r.date);
          return {
            'Fecha': fechaFormatted,
            'Día': diaNombre,
            'Cantidad': r.positions
          };
        }));
        XLSX.utils.book_append_sheet(wb, wsBianchi, "Bianchi");
      }

      // 5. Cepas
      if (datasets.cepasRecords.length > 0) {
        const wsCepas = XLSX.utils.json_to_sheet(datasets.cepasRecords.map(r => {
          const { fechaFormatted, diaNombre } = formatReportDate(r.date);
          return {
            'Fecha': fechaFormatted,
            'Día': diaNombre,
            'Cantidad': r.positions
          };
        }));
        XLSX.utils.book_append_sheet(wb, wsCepas, "Cepas");
      }

      // 6. Escorihuela
      if (datasets.escorihuelaRecords.length > 0) {
        const wsEscorihuela = XLSX.utils.json_to_sheet(datasets.escorihuelaRecords.map(r => {
          const { fechaFormatted, diaNombre } = formatReportDate(r.date);
          return {
            'Fecha': fechaFormatted,
            'Día': diaNombre,
            'Cantidad': r.positions
          };
        }));
        XLSX.utils.book_append_sheet(wb, wsEscorihuela, "Escorihuela");
      }

      // 7. La Rural
      if (datasets.laRuralRecords.length > 0) {
        const wsLaRural = XLSX.utils.json_to_sheet(datasets.laRuralRecords.map(r => {
          const { fechaFormatted, diaNombre } = formatReportDate(r.date);
          return {
            'Fecha': fechaFormatted,
            'Día': diaNombre,
            'Cantidad': r.positions
          };
        }));
        XLSX.utils.book_append_sheet(wb, wsLaRural, "La Rural");
      }

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const rawBytes = new Uint8Array(wbout as ArrayBuffer);
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `Reporte_Consolidado_Integral_${timestampStr}.xlsx`;
      const totalItems = datasets.records.length + datasets.palletRecords.length + datasets.cepasRecords.length + datasets.escorihuelaRecords.length + datasets.laRuralRecords.length + datasets.abastecimientos.length;
      const summaryText = `Reporte Consolidado Integral con todas las bodegas, stock y movimientos (${totalItems} registros totales).`;
      const emailSubject = agent.email_subject || `Consolidado Integral de Operaciones y Stock - ${dateLabel}`;
      const metricsText = [
        `• Bodegas Bianchi (Últimas Posiciones): ${lastBianchi}`,
        `• Cepas (Últimas Posiciones): ${lastCepas}`,
        `• Escorihuela Gascón (Últimas Posiciones): ${lastEscorihuela}`,
        `• La Rural (Últimas Posiciones): ${lastLaRural}`,
        `• Total Kilos Raizen: ${totalKilos.toLocaleString('es-AR')} kg`,
        `• Movimientos de Abastecimiento: ${totalAbast}`
      ].join('\n');
      const emailBody = formatEmailBody(
        agent,
        `Comparto el reporte consolidado integral con la información unificada de todas las bodegas, posiciones de stock y movimientos de abastecimiento.`,
        metricsText,
        fileName
      );

      return {
        fileName,
        blob,
        rawBytes,
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
      const rawBytes = new TextEncoder().encode(jsonStr);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const fileName = `Backup_Completo_Sistema_${timestampStr}.json`;
      const totalItems = datasets.records.length + datasets.palletRecords.length + datasets.cepasRecords.length + datasets.escorihuelaRecords.length + datasets.laRuralRecords.length + datasets.abastecimientos.length;
      const summaryText = `Copia de seguridad completa en formato JSON (${totalItems} registros totales).`;
      const emailSubject = agent.email_subject || `[AUTOMÁTICO] Copia de Seguridad del Sistema - ${dateLabel}`;
      const emailBody = formatEmailBody(
        agent,
        `Comparto la copia de seguridad integral (Backup JSON) de la base de datos de Calico S.A.\n\nTotal de registros respaldados: ${totalItems}`,
        '',
        fileName
      );

      return {
        fileName,
        blob,
        rawBytes,
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

export function openOutlookWeb(recipients: string[], subject: string, body: string) {
  const to = recipients.join(';');
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);
  const webOutlookUrl = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodedSubject}&body=${encodedBody}`;
  window.open(webOutlookUrl, '_blank');
}

export function triggerMailto(recipients: string[], subject: string, body: string) {
  const to = recipients.join(';');
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);
  const mailtoUrl = `mailto:${to}?subject=${encodedSubject}&body=${encodedBody}`;
  
  try {
    const link = document.createElement('a');
    link.href = mailtoUrl;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch {
    window.open(mailtoUrl, '_blank');
  }
}

export function generateAndComposeEmail(
  agent: AgentSchedule, 
  datasets: AppDatasets,
  preferWeb = false
): GeneratedFileResult {
  // 1. Generate the Excel file
  const fileResult = generateAgentFile(agent, datasets);

  // 2. Download the Excel file to the user's Downloads folder
  triggerBrowserDownload(fileResult.blob, fileResult.fileName);

  // 3. Compose new email with custom subject, recipients, and custom body
  const recipients = agent.recipients && agent.recipients.length > 0 ? agent.recipients : ['hsir@calico-sa.com.ar'];
  if (preferWeb) {
    openOutlookWeb(recipients, fileResult.emailSubject, fileResult.emailBody);
  } else {
    triggerMailto(recipients, fileResult.emailSubject, fileResult.emailBody);
  }

  return fileResult;
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
