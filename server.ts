import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { 
  getSMTPConfig, 
  saveSMTPConfig, 
  sendTestEmail, 
  executeAgent, 
  startBackgroundScheduler,
  SMTPConfig 
} from "./server/agentRunner.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Server scheduler status
  app.get("/api/agent/server-status", async (req, res) => {
    try {
      const smtp = await getSMTPConfig();
      const argTime = new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        dateStyle: 'full',
        timeStyle: 'medium'
      }).format(new Date());

      res.json({
        status: "active",
        mode: "server_24_7",
        currentTimeArgentina: argTime,
        smtpConfigured: !!(smtp.host && smtp.user),
        smtpHost: smtp.host || null,
        smtpUser: smtp.user ? smtp.user.replace(/(.{2})(.*)(@.*)/, '$1***$3') : null
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error al obtener estado del servidor' });
    }
  });

  // Get SMTP settings (with password masked)
  app.get("/api/smtp/config", async (req, res) => {
    try {
      const config = await getSMTPConfig();
      res.json({
        host: config.host || '',
        port: config.port || 587,
        secure: config.secure || false,
        user: config.user || '',
        passMasked: config.pass ? '••••••••••••••••' : '',
        hasPassword: !!config.pass,
        fromName: config.fromName || 'Calico S.A. Automatizaciones',
        fromEmail: config.fromEmail || config.user || '',
        is_active: !!(config.host && config.user && config.pass)
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error al leer configuración SMTP' });
    }
  });

  // Save SMTP settings
  app.post("/api/smtp/config", async (req, res) => {
    try {
      const { host, port, secure, user, pass, fromName, fromEmail } = req.body;
      const current = await getSMTPConfig();

      const newConfig: SMTPConfig = {
        host: (host || '').trim(),
        port: parseInt(port || '587', 10),
        secure: !!secure,
        user: (user || '').trim(),
        pass: pass && pass !== '••••••••••••••••' ? pass.trim() : current.pass,
        fromName: (fromName || 'Calico S.A. Automatizaciones').trim(),
        fromEmail: (fromEmail || user || '').trim(),
        is_active: !!((host || '').trim() && (user || '').trim())
      };

      await saveSMTPConfig(newConfig);
      res.json({ success: true, message: 'Configuración SMTP guardada con éxito en el servidor.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error al guardar configuración SMTP' });
    }
  });

  // Test SMTP connection and send a test email
  app.post("/api/smtp/test", async (req, res) => {
    try {
      const { toEmail, customConfig } = req.body;
      if (!toEmail) {
        return res.status(400).json({ error: 'Debe especificar un correo de destino para la prueba.' });
      }

      const result = await sendTestEmail(toEmail.trim(), customConfig);
      res.json(result);
    } catch (err: any) {
      console.error('[API SMTP Test Error]', err);
      res.status(500).json({ error: err.message || 'Error al enviar correo de prueba' });
    }
  });

  // Manually trigger an agent execution on the server
  app.post("/api/agent/run-now/:id", async (req, res) => {
    try {
      const agentId = req.params.id;
      const result = await executeAgent(agentId, true);
      res.json(result);
    } catch (err: any) {
      console.error('[API Run Agent Error]', err);
      res.status(500).json({ error: err.message || 'Error al ejecutar agente' });
    }
  });

  // Start background 24/7 Agent Scheduler
  startBackgroundScheduler();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
