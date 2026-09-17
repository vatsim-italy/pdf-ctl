import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import { PDFDocument } from 'pdf-lib';
import { pdfFieldMapS2, pdfFieldMapS3, pdfFieldMapC1 } from './fieldMap.js';

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const API_KEY = process.env.PDF_API_KEY;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const TEMPLATE_DIR = path.resolve(process.env.TEMPLATE_DIR || './templates');

if (NODE_ENV === 'production' && !API_KEY) {
  console.error('FATAL: PDF_API_KEY must be set in production.');
  process.exit(1);
}

const RATING_FIELD_MAPS = {
  S2: pdfFieldMapS2,
  S3: pdfFieldMapS3,
  C1: pdfFieldMapC1,
};

// --- App setup ---
const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : NODE_ENV === 'production' ? [] : true,
  })
);

function requireApiKey(req, res, next) {
  if (!API_KEY) return next(); // dev only, no key configured
  if (req.get('x-api-key') !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}
function logError(...args) {
  console.error(new Date().toISOString(), ...args);
}

// --- PDF generation ---

function normalizeLocalExaminers(data) {
  if (!data.local_examiners) return;
  let locals = data.local_examiners;
  if (typeof locals === 'string') {
    try {
      locals = JSON.parse(locals);
    } catch (e) {
      logError('Could not parse local_examiners JSON:', e.message);
      delete data.local_examiners;
      return;
    }
  }
  if (Array.isArray(locals)) {
    if (locals[0]) {
      data.examinerName1 = locals[0].name || '';
      data.examinerCid1 = locals[0].id || '';
      data.examinerRating1 = locals[0].rating || '';
    }
    if (locals[1]) {
      data.examinerName2 = locals[1].name || '';
      data.examinerCid2 = locals[1].id || '';
      data.examinerRating2 = locals[1].rating || '';
    }
  }
  delete data.local_examiners;
}

function tryFillField(form, pdfKey, value) {
  const attempts = [
    () => form.getTextField(pdfKey).setText(String(value)),
    () => form.getDropdown(pdfKey).select(value),
    () => {
      const cb = form.getCheckBox(pdfKey);
      value ? cb.check() : cb.uncheck();
    },
    () => form.getRadioGroup(pdfKey).select(value),
  ];
  for (const attempt of attempts) {
    try {
      attempt();
      return true;
    } catch {
      // try next field type
    }
  }
  return false;
}

/**
 * Fills the PDF form in memory and returns the resulting bytes.
 * Never touches disk, so concurrent requests can't clobber each other's output.
 */
async function generatePdfBytes(rawData) {
  const rating = rawData?.rating;
  const pdfFieldMap = RATING_FIELD_MAPS[rating];
  if (!pdfFieldMap) {
    const err = new Error(`Unsupported or missing rating: "${rating}"`);
    err.status = 400;
    throw err;
  }

  const templatePath = path.join(TEMPLATE_DIR, `${rating}.pdf`);
  let templateBytes;
  try {
    templateBytes = await fs.readFile(templatePath);
  } catch {
    const err = new Error(`Template not found for rating "${rating}"`);
    err.status = 500;
    throw err;
  }

  const data = { ...rawData };
  data.vaccName = data.vaccName || 'VATITA';

  if (typeof data.facilityTwr === 'string' && data.facilityTwr.length > 27) {
    const parts = data.facilityTwr.split(' - ');
    data.facilityTwr = (parts[1] || parts[0]).trim();
  }

  normalizeLocalExaminers(data);

  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  for (const [reqKey, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '') continue;
    const pdfKey = pdfFieldMap[reqKey] || reqKey;
    if (!tryFillField(form, pdfKey, value)) {
      log(`Could not fill field: reqKey="${reqKey}", pdfKey="${pdfKey}"`);
    }
  }

  form.flatten();
  return pdfDoc.save();
}

// --- Routes ---

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/pdfapi/controlcenter', requireApiKey, async (req, res, next) => {
  try {
    const pdfBytes = await generatePdfBytes(req.body);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', 'inline; filename="exam_report.pdf"');
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    next(err);
  }
});

app.post('/pdfapi/json', requireApiKey, async (req, res, next) => {
  try {
    const payload = req.body?.json ?? req.body;
    const pdfBytes = await generatePdfBytes(payload);
    res.json({ pdfBase64: Buffer.from(pdfBytes).toString('base64') });
  } catch (err) {
    next(err);
  }
});

if (NODE_ENV !== 'production') {
  app.get('/pdfapi/test/:rating', requireApiKey, async (req, res, next) => {
    try {
      const rating = req.params.rating.toUpperCase();
      const templatePath = path.join(TEMPLATE_DIR, `${rating}.pdf`);
      const templateBytes = await fs.readFile(templatePath);
      const pdfDoc = await PDFDocument.load(templateBytes);
      const form = pdfDoc.getForm();
      const fieldInfo = form.getFields().map((f) => ({
        name: f.getName(),
        type: f.constructor.name,
      }));
      res.json(fieldInfo);
    } catch (err) {
      next(err);
    }
  });
}

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  logError(err);
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
});

app.listen(PORT, () => log(`PDF API running on port ${PORT} (${NODE_ENV})`));