import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import path from 'node:path';
import { registerAuth } from './routes/Auth.js';
import { registerCatalog } from './routes/Catalog.js';
import { registerReports } from './routes/Reports.js';
import { registerReportExtras } from './routes/ReportExtras.js';
import { registerReportEditing } from './routes/ReportEditing.js';
import { registerVendors } from './routes/Vendors.js';
import { registerVendorNegative } from './routes/VendorNegative.js';
import { registerUsers } from './routes/Users.js';

export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginOpenerPolicy: false,
      originAgentCluster: false,
      hsts: false,
    }),
  );
  app.use(express.json({ limit: '1mb' }), cookieParser());
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      let isAllowed = !origin;
      if (origin) {
        try {
          const originUrl = new URL(origin);
          const reqHost = req.get('host') || '';
          const reqHostname = req.hostname || '';
          const fwdHost = req.get('x-forwarded-host') || '';
          const allowed = [
            process.env.APP_ORIGIN,
            'http://127.0.0.1:5173',
            'http://localhost:5173',
            'http://127.0.0.1:3001',
            'http://localhost:3001',
          ].filter(Boolean);
          const matchesConfig = allowed.some((a) => {
            try {
              const u = new URL(a);
              return u.origin === originUrl.origin || u.hostname === originUrl.hostname;
            } catch {
              return a === origin;
            }
          });
          const matchesHost =
            originUrl.host === reqHost ||
            originUrl.hostname === reqHostname ||
            (fwdHost &&
              (originUrl.host === fwdHost || originUrl.hostname === fwdHost.split(':')[0]));
          isAllowed = matchesConfig || matchesHost;
        } catch {
          isAllowed = false;
        }
      }
      if (req.get('x-voip-request') !== '1' || !isAllowed)
        return res.status(403).json({ error: 'Request origin not allowed.' });
    }
    next();
  });
  registerAuth(app, db);
  registerUsers(app, db);
  registerCatalog(app, db);
  registerReports(app, db);
  registerReportExtras(app, db);
  registerReportEditing(app, db);
  registerVendors(app, db);
  registerVendorNegative(app, db);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  app.use(express.static(path.resolve('dist')));
  app.get('/{*path}', (req, res) => res.sendFile(path.resolve('dist/index.html')));
  app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res
        .status(400)
        .json({ error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    if (err.code === '23505')
      return res
        .status(409)
        .json({ error: 'That name already exists. Please use a different name.' });
    if (err.code === '23503')
      return res.status(400).json({ error: 'Selected campaign does not exist.' });
    if (err.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Invalid JSON request.' });
    console.error('Request failed:', err.code || err.name);
    res
      .status(500)
      .json({ error: 'Unable to complete request. Check the server and database connection.' });
  });
  return app;
}
