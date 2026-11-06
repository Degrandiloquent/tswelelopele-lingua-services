require('dotenv').config();
const express = require('express'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const app = express();
app.use(express.json({ limit: '20kb' }));

/* ---------- tiny JSON-file store (no database to install) ---------- */
const DATA = path.join(__dirname, 'data'); fs.mkdirSync(DATA, { recursive: true });
const fp = n => path.join(DATA, n + '.json');
const read = n => { try { return JSON.parse(fs.readFileSync(fp(n), 'utf8')); } catch { return []; } };
const write = (n, a) => fs.writeFileSync(fp(n), JSON.stringify(a, null, 2));
const add = (n, rec) => { const a = read(n); rec = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...rec }; a.push(rec); write(n, a); return rec; };

/* ---------- helpers ---------- */
const clean = (v, max = 300) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const hits = new Map();
const limit = (req, res, next) => {            // 15 submissions / 10 min / IP
  const k = req.ip, now = Date.now(), a = (hits.get(k) || []).filter(t => now - t < 600000);
  if (a.length >= 15) return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  a.push(now); hits.set(k, a); next();
};
const bad = (res, msg) => res.status(400).json({ error: msg });

/* Email via Brevo's HTTPS API (free plan). Render's free tier blocks SMTP, but HTTPS works. */
const mail = async (to, subject, text, replyTo) => {
  const key = process.env.BREVO_API_KEY, from = process.env.SENDER_EMAIL;
  if (!key || !from) return console.log(`[email not configured] ${subject} -> ${to}`);
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { name: 'Tswelelopele Lingua Services', email: from }, to: [{ email: to }],
        subject, textContent: text, ...(replyTo ? { replyTo: { email: replyTo } } : {}) }) });
    if (!r.ok) console.error('Email failed:', r.status, await r.text());
  } catch (e) { console.error('Email failed:', e.message); }
};
const OWNER = process.env.OWNER_EMAIL || 'Tswelelopele.services@gmail.com';

/* ---------- pricing (mirrors the fee structure on the website) ---------- */
const RATES = {
  translation: 0.35, editing: 0.25, proofreading: 0.25, 'post-editing': 0.50,
  technical: 1.00, thesis: 1.00, fiction: 0.35 };
const MIN_FEE = 150;
function estimate(service, words) {
  const rate = RATES[service]; if (!rate || !(words > 0) || words > 1000000) return null;
  const raw = +(rate * words).toFixed(2), total = Math.max(raw, MIN_FEE);
  return { service, words, rate, total, minimumApplied: raw < MIN_FEE, deposit: +(total / 2).toFixed(2) };
}

/* ---------- public API ---------- */
app.post('/api/quote', limit, (req, res) => {
  const q = estimate(clean(req.body.service, 30), Number(req.body.words));
  q ? res.json(q) : bad(res, 'Choose a service and enter a word count greater than 0.');
});

app.post('/api/enquiries', limit, async (req, res) => {
  const b = req.body;
  if (b.website) return res.json({ ok: true });                 // honeypot: bots fill this hidden field
  const e = { name: clean(b.name, 100), email: clean(b.email, 150), service: clean(b.service, 60),
    pair: clean(b.pair, 80), deadline: clean(b.deadline, 20), message: clean(b.message, 2000) };
  if (!e.name || !isEmail(e.email)) return bad(res, 'Please enter your name and a valid email address.');
  const saved = add('enquiries', { ...e, status: 'new' });
  mail(OWNER, `New enquiry: ${e.service} from ${e.name}`, Object.entries(e).map(([k, v]) => `${k}: ${v}`).join('\n'), e.email);
  mail(e.email, 'We received your enquiry | Tswelelopele Lingua Services',
    `Hi ${e.name},\n\nThank you for contacting Tswelelopele Lingua Services. We have received your enquiry and will reply with a written quote.\n\nPlease have your editable Word file, language pair, purpose and deadline ready.\n\nProgress is the point,\nTswelelopele Lingua Services\n0829073900`);
  res.status(201).json({ ok: true, reference: saved.id.slice(0, 8).toUpperCase() });
});

app.post('/api/feedback', limit, (req, res) => {
  const b = req.body; if (b.website) return res.json({ ok: true });
  const f = { name: clean(b.name, 80), rating: Math.round(Number(b.rating)), comment: clean(b.comment, 600) };
  if (!f.name || !(f.rating >= 1 && f.rating <= 5) || f.comment.length < 5) return bad(res, 'Please add your name, a rating and a short comment.');
  add('feedback', { ...f, approved: false });
  mail(OWNER, `New review (${f.rating}/5) from ${f.name}`, `${f.comment}\n\nTo publish it permanently, add it to content/testimonials.json and push to GitHub.`);                    // shown publicly only after you approve it
  res.status(201).json({ ok: true });
});

const curated = () => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'content', 'testimonials.json'), 'utf8')); } catch { return []; } };
app.get('/api/testimonials', (_req, res) =>
  res.json([...read('feedback').filter(f => f.approved).reverse(), ...curated()].slice(0, 6).map(({ name, rating, comment }) => ({ name, rating, comment }))));
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/newsletter', limit, (req, res) => {
  const email = clean(req.body.email, 150).toLowerCase();
  if (!isEmail(email)) return bad(res, 'Please enter a valid email address.');
  if (!read('subscribers').some(s => s.email === email)) { add('subscribers', { email }); mail(OWNER, 'New newsletter subscriber', email); }
  res.status(201).json({ ok: true });
});

/* ---------- admin API (Bearer token from .env) ---------- */
const auth = (req, res, next) => {
  const t = Buffer.from((req.get('authorization') || '').replace(/^Bearer /, '')), s = Buffer.from(process.env.ADMIN_TOKEN || '');
  if (!s.length || t.length !== s.length || !crypto.timingSafeEqual(t, s)) return res.status(401).json({ error: 'Unauthorised' });
  next();
};
app.get('/api/admin/:kind(enquiries|feedback|subscribers)', auth, (req, res) => res.json(read(req.params.kind).reverse()));
app.patch('/api/admin/:kind(enquiries|feedback)/:id', auth, (req, res) => {
  const a = read(req.params.kind), r = a.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (req.params.kind === 'feedback') r.approved = !!req.body.approved; else r.status = clean(req.body.status, 20) || r.status;
  write(req.params.kind, a); res.json(r);
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
app.listen(process.env.PORT || 3000, () => console.log(`Tswelelopele site running on http://localhost:${process.env.PORT || 3000}`));
