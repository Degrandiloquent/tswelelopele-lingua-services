const $ = id => document.getElementById(id);
const btn = $('menu'), list = $('navlist');
btn.addEventListener('click', () => { const o = list.classList.toggle('open'); btn.setAttribute('aria-expanded', o); });
list.addEventListener('click', e => { if (e.target.tagName === 'A') { list.classList.remove('open'); btn.setAttribute('aria-expanded', false); } });
$('year').textContent = new Date().getFullYear();

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => 'R' + n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function post(url, data) {
  let r; try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); }
  catch { throw new Error('We could not reach the server. Please email Tswelelopele.services@gmail.com or WhatsApp 082 907 3900.'); }
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.'); return j;
}
function handle(formId, statusId, url, build, ok) {
  const f = $(formId), s = $(statusId);
  f.addEventListener('submit', async e => {
    e.preventDefault(); const b = f.querySelector('button[type=submit]'); b.disabled = true; s.className = 'status'; s.textContent = 'Sending…';
    try { const j = await post(url, build(Object.fromEntries(new FormData(f)))); s.className = 'status ok'; s.textContent = ok(j); ok.reset !== false && f.reset(); }
    catch (err) { s.className = 'status err'; s.textContent = err.message; } finally { b.disabled = false; }
  });
}
handle('enquiry', 'enquiry-status', '/api/enquiries', d => d, j => `Thank you! Your enquiry (ref ${j.reference}) was received. We'll reply with a written quote.`);
handle('feedback', 'feedback-status', '/api/feedback', d => d, () => 'Thank you! Your feedback will appear once we have reviewed it.');
handle('newsletter', 'newsletter-status', '/api/newsletter', d => d, () => 'You are subscribed. Thank you!');

$('quote').addEventListener('submit', async e => {
  e.preventDefault(); const s = $('quote-result'), d = Object.fromEntries(new FormData(e.target));
  try { const q = await post('/api/quote', d); s.className = 'status ok';
    s.innerHTML = `Estimated total: <b>${money(q.total)}</b> (${q.words.toLocaleString('en-ZA')} words × R${q.rate.toFixed(2)})${q.minimumApplied ? ' · minimum fee applied' : ''}<br>50% deposit to book: <b>${money(q.deposit)}</b>. This is an estimate only: your written quote is final.`;
  } catch (err) { s.className = 'status err'; s.textContent = err.message; }
});

fetch('/api/testimonials').then(r => r.json()).then(t => {
  if (!t.length) return;
  $('testimonials').innerHTML = t.map(x => `<figure class="card"><div class="stars" aria-label="${x.rating} out of 5">${'★'.repeat(x.rating)}${'☆'.repeat(5 - x.rating)}</div><blockquote style="margin:0 0 12px">${esc(x.comment)}</blockquote><figcaption><b>${esc(x.name)}</b></figcaption></figure>`).join('');
}).catch(() => {});
