/* Yalla Saeed — listen-first Saudi Arabic. No framework, no network needed after first load. */
(() => {
'use strict';
const Y = window.YS;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('ys.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ys.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};
const fmt = s => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

const REEM_SVG = '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8fb1"/><stop offset="1" stop-color="#ffc56e"/></linearGradient></defs><rect width="120" height="120" fill="url(#rg)"/><circle cx="97" cy="21" r="9" fill="#fff" opacity=".45"/><path d="M22 122c-7-31-9-60 4-79 8-13 21-20 34-20s26 7 34 20c13 19 11 48 4 79z" fill="#2a1620"/><path d="M30 122c2-15 13-23 30-23s28 8 30 23z" fill="#fff"/><rect x="52" y="84" width="16" height="19" rx="7" fill="#e9b693"/><ellipse cx="60" cy="64" rx="24" ry="27" fill="#f3c9a8"/><path d="M35 62c-1-21 9-33 27-33 15 0 23 10 23 28-9-2-17-8-22-17-5 11-15 19-28 22z" fill="#2a1620"/><path d="M45.500 66q5-5.500 10 0M64.500 66q5-5.500 10 0" stroke="#2a1620" stroke-width="2.800" fill="none" stroke-linecap="round"/><ellipse cx="44.500" cy="74.500" rx="5.500" ry="3.200" fill="#ff7e9d" opacity=".55"/><ellipse cx="75.500" cy="74.500" rx="5.500" ry="3.200" fill="#ff7e9d" opacity=".55"/><path d="M53 78.500q7 6.500 14 0" stroke="#c2455e" stroke-width="2.800" fill="none" stroke-linecap="round"/><path d="M30.500 66c-2-27 10-43 29.500-43s31.500 16 29.500 43" stroke="#fff" stroke-width="5.500" fill="none" stroke-linecap="round"/><rect x="23" y="57" width="14" height="26" rx="7" fill="#8ce3c7" stroke="#fff" stroke-width="2.500"/><rect x="83" y="57" width="14" height="26" rx="7" fill="#8ce3c7" stroke="#fff" stroke-width="2.500"/></svg>';
const ICO_PLAY = '<path d="M8 5.200v13.600a1 1 0 0 0 1.520.860l11-6.800a1 1 0 0 0 0-1.720l-11-6.800A1 1 0 0 0 8 5.200z"/>';
const ICO_PAUSE = '<path d="M7 5h3.600v14H7zM13.400 5H17v14h-3.600z"/>';
$$('[data-reem]').forEach(el => { el.innerHTML = REEM_SVG; });

/* ───────────── data ───────────── */
const ITEMS = [];
Y.episodes.forEach((ep, ei) => ep.items.forEach(it => { it.ep = ei; ITEMS.push(it); }));
const CUES = { lesson: Y.cues.lesson, drift: Y.cues.drift };
const RK = { lesson: 'L', drift: 'D' };               // which range field a mode uses
const voiceCues = (mode, i) => CUES[mode].map((c, ci) => ({ c, ci })).filter(o => o.c.i === i && o.c.k === 'v');

/* ───────────── state ───────────── */
let mode = store.get('mode', 'lesson');
let pad = store.get('pad', 1);
let loop = store.get('loop', 'all');
let rate = store.get('rate', 1);
const pos = store.get('pos', { lesson: 0, drift: 0 });
let sleepAt = 0, lockI = -1, lockE = -1;
let loaded = null, pendingSeek = null, shownCue = -2, shownItem = -2, shownActive = null;

const au = new Audio(); au.preload = 'auto'; au.loop = true; au.setAttribute('playsinline', '');
const clip = new Audio(); clip.preload = 'auto'; clip.setAttribute('playsinline', '');
const blobs = {};
const trackKey = () => mode === 'lesson' ? 'lesson' : (pad ? 'driftPad' : 'drift');
const LOCAL = location.protocol === 'file:';
const srcOf = k => blobs[k] || (Y.tracks[k].src + (LOCAL ? '' : '?v=' + Y.tracks[k].hash));
const dur = () => Y.tracks[trackKey()].dur;
const now = () => !loaded ? (pos[mode] || 0) : (pendingSeek != null ? pendingSeek : au.currentTime);

function cueIdx(cues, t) {
  let lo = 0, hi = cues.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (cues[m].a <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}

/* ───────────── audio engine ───────────── */
function loadTrack(t, play) {
  loaded = trackKey(); pendingSeek = Math.max(0, Math.min(t, dur() - 0.5));
  au.src = srcOf(loaded); au.load();
  if (play) au.play().catch(() => {});
}
au.addEventListener('loadedmetadata', () => {
  if (pendingSeek != null) { try { au.currentTime = pendingSeek; } catch (e) { /* retry on canplay */ } }
  au.playbackRate = rate;
});
au.addEventListener('seeked', () => { pendingSeek = null; });
au.addEventListener('canplay', () => {
  if (pendingSeek != null && Math.abs(au.currentTime - pendingSeek) > 1) { try { au.currentTime = pendingSeek; } catch (e) { /* ignore */ } }
  else pendingSeek = null;
  au.playbackRate = rate;
});
au.addEventListener('error', () => { if (loaded) toast('I need the internet once to download the voices.'); });

function seek(t, play) {
  t = Math.max(0, Math.min(t, dur() - 0.3));
  if (loaded !== trackKey()) loadTrack(t, play);
  else { pendingSeek = t; try { au.currentTime = t; } catch (e) { /* not ready */ } if (play) au.play().catch(() => {}); }
  pos[mode] = t; render(true);
}
function toggle() {
  stopClip();
  if (loaded !== trackKey()) return loadTrack(pos[mode] || 0, true);
  if (au.paused) au.play().catch(() => {}); else au.pause();
}
function itemAt(t) {            // item under the playhead, or the next one coming up
  const cues = CUES[mode], i = cueIdx(cues, t);
  if (i >= 0 && cues[i].i >= 0) return cues[i].i;
  for (let j = Math.max(0, i); j < cues.length; j++) if (cues[j].i >= 0) return cues[j].i;
  return 0;
}
function jumpItem(i, play) {
  i = (i + ITEMS.length) % ITEMS.length; lockI = i; lockE = ITEMS[i].ep;
  seek(ITEMS[i][RK[mode]][0] - 0.05, play);
}
function step(d) {
  const t = now(), k = RK[mode];
  if (d > 0) { const n = ITEMS.findIndex(it => it[k][0] > t + 0.4); return jumpItem(n < 0 ? 0 : n, !au.paused || !loaded); }
  let p = -1; ITEMS.forEach((it, i) => { if (it[k][0] < t - 4) p = i; });
  jumpItem(p < 0 ? ITEMS.length - 1 : p, !au.paused || !loaded);
}

au.addEventListener('timeupdate', () => {
  const t = au.currentTime, k = RK[mode];
  if (pendingSeek == null && !au.seeking) {
    if (loop === 'word' && lockI >= 0) { const r = ITEMS[lockI][k]; if (t >= r[1] + 0.6 || t < r[0] - 1.5) au.currentTime = Math.max(0, r[0] - 0.05); }
    else if (loop === 'ep' && lockE >= 0) { const r = Y.episodes[lockE][k]; if (t >= r[1] + 0.8 || t < r[0] - 1.5) au.currentTime = Math.max(0, r[0] - 0.3); }
  }
  if (sleepAt && Date.now() >= sleepAt) sleepDone();
  render(false);
});
au.addEventListener('play', () => { setIcons(); render(true); });
au.addEventListener('pause', () => { setIcons(); pos[mode] = au.currentTime; store.set('pos', pos); render(true); });
setInterval(() => { if (loaded && !au.paused) { pos[mode] = au.currentTime; store.set('pos', pos); } tickSleep(); }, 3000);

function setIcons() {
  const p = loaded && !au.paused;
  $('#playIco').innerHTML = p ? ICO_PAUSE : ICO_PLAY; $('#mIco').innerHTML = p ? ICO_PAUSE : ICO_PLAY;
  $('#play').setAttribute('aria-label', p ? 'Pause' : 'Play');
}

/* ───────────── clips (peek + ear test) ───────────── */
let clipTimer = null, clipEnd = 0, clipStart = null, clipDone = null;
function stopClip() { clearInterval(clipTimer); clipTimer = null; if (!clip.paused) clip.pause(); if (clipDone) { const f = clipDone; clipDone = null; f(); } }
clip.addEventListener('loadedmetadata', () => { if (clipStart != null) { try { clip.currentTime = clipStart; } catch (e) { /* ignore */ } } });
function playClip(c, done) {
  stopClip(); if (loaded && !au.paused) au.pause();
  const src = srcOf('lesson'); clipStart = Math.max(0, c.a - 0.05); clipEnd = c.b + 0.12; clipDone = done || null;
  if (clip.dataset.src !== src) { clip.dataset.src = src; clip.src = src; clip.load(); }
  else { try { clip.currentTime = clipStart; } catch (e) { /* ignore */ } }
  clip.play().catch(() => {});
  clipTimer = setInterval(() => {
    if (clip.readyState > 0 && Math.abs(clip.currentTime - clipStart) > 0.3 && clip.currentTime < clipStart - 0.3) { try { clip.currentTime = clipStart; } catch (e) { /* ignore */ } }
    if (clip.currentTime >= clipEnd) stopClip();
  }, 25);
}

/* ───────────── render: the listen screen ───────────── */
function render(force) {
  const t = now(), cues = CUES[mode], ci = cueIdx(cues, t), c = ci >= 0 ? cues[ci] : null;
  const playing = loaded && !au.paused;
  const live = c && t < c.b + 0.1 ? ci : -1;
  $('#fill').style.width = (t / dur() * 100).toFixed(2) + '%';
  $('#tCur').textContent = fmt(t);
  if (!force && ci === shownCue && live === shownActive) return;
  shownCue = ci; shownActive = live;

  const ii = c ? c.i : -1, ei = c ? c.e : 0, ep = Y.episodes[ei];
  if (force || ii !== shownItem || ii < 0) { shownItem = ii; drawCard(ii, ep); }
  const a = live >= 0 ? c : null;
  $('#wordBox').classList.toggle('hot', !!a && a.p === 'w');
  $('#phrBox').classList.toggle('hot', !!a && a.p === 'p');
  $$('#crew .vc').forEach(b => b.classList.toggle('on', +b.dataset.ci === live));
  $('#now').classList.toggle('pulse', !!a && a.k === 'v');
  $('#ava').classList.toggle('talk', playing && !!a && (a.k === 'r' || a.k === 'ra'));

  const who = $('#who'), cap = $('#cap'); cap.removeAttribute('lang');
  if (!loaded && t < 1) { who.textContent = 'Reem'; cap.textContent = mode === 'lesson' ? `Headphones in, ${Y.learner}? Tap play. I'll do the rest.` : `The quiet version. Tap play and close your eyes, ${Y.learner}.`; }
  else if (c && c.k === 'r') { who.textContent = 'Reem'; cap.textContent = c.x; }
  else if (c && c.k === 'ra') { const it = ITEMS[c.i]; who.textContent = 'Reem · in Arabic'; cap.textContent = c.p === 'p' ? it.ph.v : it.v; cap.setAttribute('lang', 'ar'); }
  else if (c && c.k === 'v') { const p = Y.cast[c.w], m = Y.moods[c.m]; who.textContent = `${p.name} · ${p.city}`; cap.textContent = `${p.emoji}  ${m.emoji} ${m.label}`; }
  else if (c && c.k === 'you') { who.textContent = `Your turn, ${Y.learner}`; cap.textContent = c.p === 'p' ? 'The whole phrase. In your head is fine 🤫' : 'Say it. A whisper counts 🤫'; }
  mediaMeta(ii, ep);
  $('#mT').textContent = ii >= 0 ? `${ITEMS[ii].tl} · ${ITEMS[ii].en}` : ep.title;
  $('#mS').textContent = (mode === 'lesson' ? 'Lesson with Reem' : 'Drift') + ' · ' + ep.title;
  $$('#epRow .epc').forEach((b, i) => b.classList.toggle('on', i === ei));
}

function drawCard(ii, ep) {
  const card = $('#now'); card.style.setProperty('--card', ep.color);
  $('#epName').textContent = ep.title;
  if (ii < 0) {
    $('#count').textContent = `${ep.items.length} words`;
    $('#stk').textContent = ep.emoji; $('#nAr').textContent = ''; $('#nAr').hidden = true;
    $('#nTl').textContent = ep.title; $('#nEn').textContent = ep.sub; $('#nHook').textContent = 'just listen';
    $('#phrBox').hidden = true; $('#crew').innerHTML = ''; return;
  }
  const it = ITEMS[ii];
  $('#count').textContent = `${ii + 1} / ${ITEMS.length}`;
  $('#stk').textContent = it.emoji; $('#nAr').hidden = false; $('#nAr').textContent = it.v;
  $('#nTl').textContent = it.tl; $('#nEn').textContent = it.en; $('#nHook').textContent = it.hook;
  $('#phrBox').hidden = false; $('#pAr').textContent = it.ph.v; $('#pTl').textContent = it.ph.tl; $('#pEn').textContent = it.ph.en;
  $('#crew').innerHTML = voiceCues(mode, ii).map(({ c, ci }) => chip('vc' + (c.p === 'p' ? ' ph' : ''), c, ci)).join('');
}
const chip = (cls, c, ci) => { const p = Y.cast[c.w], m = Y.moods[c.m]; return `<button class="${cls}" data-ci="${ci}" title="${esc(p.name)}, ${esc(p.city)}"><span class="f">${p.emoji}</span>${esc(p.name)} <small>${m.emoji}</small></button>`; };
$('#crew').addEventListener('click', e => { const b = e.target.closest('.vc'); if (b) { stopClip(); seek(CUES[mode][+b.dataset.ci].a - 0.05, true); } });

let metaKey = '';
function mediaMeta(ii, ep) {
  if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
  const key = mode + ii + ep.id; if (key === metaKey) return; metaKey = key;
  const it = ii >= 0 ? ITEMS[ii] : null;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: it ? `${it.tl} — ${it.en}` : ep.title,
    artist: it ? `${it.ar}  ·  ${it.ph.tl}` : ep.sub,
    album: (mode === 'lesson' ? 'Lesson with Reem' : 'Drift') + ' · Yalla ' + Y.learner,
    artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
  });
}
if ('mediaSession' in navigator) {
  const h = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) { /* unsupported */ } };
  h('play', () => au.play()); h('pause', () => au.pause());
  h('nexttrack', () => step(1)); h('previoustrack', () => step(-1));
  h('seekbackward', () => seek(now() - 10, !au.paused)); h('seekforward', () => seek(now() + 10, !au.paused));
}

/* ───────────── controls ───────────── */
$('#play').onclick = toggle; $('#mPlay').onclick = toggle;
$('#next').onclick = () => step(1); $('#prev').onclick = () => step(-1);
$('#back').onclick = () => seek(now() - 10, loaded && !au.paused);
$('#again').onclick = () => jumpItem(itemAt(now()), true);
$('#mTxt').onclick = () => tab('listen');
$('#ava').onclick = $('#aboutBtn').onclick = () => about();
document.addEventListener('keydown', e => { if (e.code === 'Space' && !/BUTTON|INPUT/.test(document.activeElement.tagName)) { e.preventDefault(); toggle(); } });

(function barDrag() {
  const bar = $('#bar'); let down = false;
  const at = e => { const r = bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur(); };
  bar.addEventListener('pointerdown', e => { down = true; bar.setPointerCapture(e.pointerId); $('#fill').style.width = (at(e) / dur() * 100) + '%'; });
  bar.addEventListener('pointermove', e => { if (down) { $('#fill').style.width = (at(e) / dur() * 100) + '%'; $('#tCur').textContent = fmt(at(e)); } });
  bar.addEventListener('pointerup', e => { if (!down) return; down = false; const t = at(e); lockI = itemAt(t); lockE = ITEMS[lockI].ep; seek(t, loaded && !au.paused); });
  bar.addEventListener('keydown', e => { if (e.key === 'ArrowRight') seek(now() + 10, loaded && !au.paused); if (e.key === 'ArrowLeft') seek(now() - 10, loaded && !au.paused); });
})();

function setMode(m) {
  if (m === mode) return;
  const wasPlaying = loaded && !au.paused, cur = now(), c = CUES[mode][cueIdx(CUES[mode], cur)];
  pos[mode] = cur; mode = m; store.set('mode', m);
  const t = c && c.i >= 0 ? ITEMS[c.i][RK[m]][0] - 0.05 : (pos[m] || 0);
  paintOpts(); drawMarks(); shownItem = -2;
  if (loaded) loadTrack(t, wasPlaying); pos[m] = Math.max(0, t); store.set('pos', pos); render(true);
}
$$('.modes button').forEach(b => { b.onclick = () => setMode(b.dataset.mode); });
function paintOpts() {
  $$('.modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  $$('[data-loop]').forEach(b => b.classList.toggle('on', b.dataset.loop === loop));
  $$('[data-rate]').forEach(b => b.classList.toggle('on', +b.dataset.rate === rate));
  $$('[data-pad]').forEach(b => b.classList.toggle('on', +b.dataset.pad === pad));
  $$('[data-sleep]').forEach(b => b.classList.toggle('on', sleepAt ? +b.dataset.sleep === sleepMin : +b.dataset.sleep === 0));
  $('#padRow').hidden = mode !== 'drift';
  $('#tTot').textContent = fmt(dur());
}
$$('[data-loop]').forEach(b => { b.onclick = () => { loop = b.dataset.loop; store.set('loop', loop); lockI = itemAt(now()); lockE = ITEMS[lockI].ep; au.loop = true; paintOpts(); toast(loop === 'all' ? 'Playing everything, on repeat' : loop === 'ep' ? `Repeating “${Y.episodes[lockE].title}”` : `Repeating “${ITEMS[lockI].tl}”`); }; });
$$('[data-rate]').forEach(b => { b.onclick = () => { rate = +b.dataset.rate; store.set('rate', rate); au.playbackRate = rate; paintOpts(); }; });
$$('[data-pad]').forEach(b => { b.onclick = () => { const v = +b.dataset.pad; if (v === pad) return; const p = loaded && !au.paused, t = now(); pad = v; store.set('pad', pad); paintOpts(); if (loaded) loadTrack(t, p); }; });
let sleepMin = 0;
$$('[data-sleep]').forEach(b => { b.onclick = () => { sleepMin = +b.dataset.sleep; sleepAt = sleepMin ? Date.now() + sleepMin * 60000 : 0; paintOpts(); tickSleep(); if (sleepMin) toast(`I'll stop in ${sleepMin} minutes`); }; });
function tickSleep() { $('#sleepLeft').textContent = sleepAt ? Math.max(1, Math.ceil((sleepAt - Date.now()) / 60000)) + ' min left' : ''; if (sleepAt && Date.now() >= sleepAt) sleepDone(); }
function sleepDone() { sleepAt = 0; sleepMin = 0; au.pause(); paintOpts(); tickSleep(); toast(`Sleep well, ${Y.learner} 🌙`); }

function drawMarks() {
  const k = RK[mode], d = dur();
  $('#marks').innerHTML = Y.episodes.slice(1).map(ep => `<b style="left:${(ep[k][0] / d * 100).toFixed(2)}%"></b>`).join('');
}
$('#epRow').innerHTML = Y.episodes.map((ep, i) => `<button class="epc" data-ep="${i}" style="background:${ep.color}"><span>${ep.emoji}</span><div>${esc(ep.title)}<small>${ep.items.length} words</small></div></button>`).join('');
$('#epRow').addEventListener('click', e => { const b = e.target.closest('.epc'); if (!b) return; const ep = Y.episodes[+b.dataset.ep]; lockE = +b.dataset.ep; lockI = ep.items[0].n; stopClip(); seek(ep[RK[mode]][0] - 0.3, true); });

/* ───────────── tabs ───────────── */
function tab(name) {
  $$('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + name));
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  $('#mini').hidden = name === 'listen' || !loaded;
  $('#dock').hidden = name !== 'listen';
  if (name !== 'quiz') stopClip();
  window.scrollTo(0, 0);
}
$$('.tabs button').forEach(b => { b.onclick = () => tab(b.dataset.tab); });

/* ───────────── peek ───────────── */
$('#peekList').innerHTML = Y.episodes.map(ep => `<div class="eph"><b>${ep.emoji} ${esc(ep.title)}</b><small>${esc(ep.sub)}</small></div><div class="grid">` +
  ep.items.map(it => `<button class="tile" data-i="${it.n}" style="background:${ep.color}"><span class="e">${it.emoji}</span><span class="a" lang="ar" dir="rtl">${it.v}</span><span class="t">${esc(it.tl)}</span><span class="m">${esc(it.en)}</span></button>`).join('') + '</div>').join('');
$('#peekList').addEventListener('click', e => { const b = e.target.closest('.tile'); if (b) detail(+b.dataset.i); });

const LET = { 'ا': ['alif', 'aa'], 'أ': ['alif + hamza', 'a'], 'إ': ['alif + hamza', 'i'], 'آ': ['alif madda', 'aa'], 'ب': ['baa', 'b'], 'ت': ['taa', 't'], 'ث': ['thaa', 'th'], 'ج': ['jeem', 'j'], 'ح': ['Haa', 'h · breathy'], 'خ': ['khaa', 'kh · scratchy'], 'د': ['daal', 'd'], 'ذ': ['dhaal', 'dh'], 'ر': ['raa', 'r · tapped'], 'ز': ['zaay', 'z'], 'س': ['seen', 's'], 'ش': ['sheen', 'sh'], 'ص': ['Saad', 's · heavy'], 'ض': ['Daad', 'd · heavy'], 'ط': ['Taa', 't · heavy'], 'ظ': ['Zaa', 'z · heavy'], 'ع': ['ayn', 'squeezed a'], 'غ': ['ghayn', 'gh · gargle'], 'ف': ['faa', 'f'], 'ق': ['qaaf', 'q → g in Riyadh'], 'ك': ['kaaf', 'k'], 'ل': ['laam', 'l'], 'م': ['meem', 'm'], 'ن': ['noon', 'n'], 'ه': ['haa', 'h'], 'و': ['waaw', 'w / oo'], 'ي': ['yaa', 'y / ee'], 'ى': ['alif (dotless)', 'aa'], 'ة': ['taa marbuuta', '-a'], 'ء': ['hamza', 'tiny catch'] };
const MARK = { 'َ': '+ a', 'ُ': '+ u', 'ِ': '+ i', 'ْ': 'no vowel', 'ّ': 'doubled', 'ً': '+ an', 'ٌ': '+ un', 'ٍ': '+ in', 'ٰ': '+ aa' };
function spell(v) {
  const out = [];
  for (const ch of v) {
    if (LET[ch]) out.push({ g: ch, m: [] });
    else if (MARK[ch] && out.length && out[out.length - 1].g) { out[out.length - 1].g += ch; out[out.length - 1].m.push(MARK[ch]); }
    else if (ch === ' ' && out.length) out.push({ sp: 1 });
  }
  return out.map(o => o.sp ? '<span class="lt sp"></span>' : `<span class="lt"><span class="g" lang="ar">${o.g}</span><b>${LET[o.g[0]][0]}</b><small>${LET[o.g[0]][1]}${o.m.length ? ' · ' + o.m.join(', ') : ''}</small></span>`).join('');
}

function openSheet(html) { $('#sheetIn').innerHTML = html; $('#sheet').scrollTop = 0; $('#app').classList.add('open'); }
function closeSheet() { $('#app').classList.remove('open'); stopClip(); }
$('#sheetBg').onclick = closeSheet; $('#sheetX').onclick = closeSheet;
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

function detail(i) {
  const it = ITEMS[i], ep = Y.episodes[it.ep], vs = voiceCues('lesson', i);
  const firstPh = vs.find(o => o.c.p === 'p');
  openSheet(`<div class="big" style="background:${ep.color}"><div class="e">${it.emoji}</div><div class="a" lang="ar" dir="rtl">${it.v}</div><div class="t">${esc(it.tl)}</div><div class="m">${esc(it.en)}</div><div class="hook">${esc(it.hook)}</div></div>
  <div class="sec"><h3>Hear it from everyone</h3><div class="voices">${vs.filter(o => o.c.p === 'w').map(o => chip('vb', o.c, o.ci).replace('<small>', `<small>${esc(Y.cast[o.c.w].city)} `)).join('')}</div></div>
  <div class="sec"><h3>Reem says</h3><p class="quote">${esc(it.say)}</p></div>
  <div class="sec"><h3>The only phrase you need</h3><div class="phc"><div><span class="a" lang="ar">${it.ph.v}</span><b>${esc(it.ph.tl)}</b><small>${esc(it.ph.en)}</small></div>${firstPh ? `<button class="say vb2" data-ci="${firstPh.ci}" aria-label="Hear the phrase"><svg viewBox="0 0 24 24">${ICO_PLAY}</svg></button>` : ''}</div>
    <div class="voices" style="margin-top:8px">${vs.filter(o => o.c.p === 'p').map(o => chip('vb', o.c, o.ci)).join('')}</div></div>
  <div class="sec"><h3>Spell it · read right to left</h3><div class="spell">${spell(it.v)}</div></div>
  <button class="cta" data-lesson="${i}">Play Reem's lesson for this word</button>`);
}
$('#sheetIn').addEventListener('click', e => {
  const v = e.target.closest('.vb,.vb2'), l = e.target.closest('[data-lesson]'), s = e.target.closest('[data-sample]');
  if (v) { $$('#sheetIn .vb').forEach(x => x.classList.remove('on')); v.classList.add('on'); playClip(CUES.lesson[+v.dataset.ci], () => v.classList.remove('on')); }
  if (l) { closeSheet(); if (mode !== 'lesson') setMode('lesson'); tab('listen'); jumpItem(+l.dataset.lesson, true); }
  if (s) { const mine = CUES.lesson.filter(c => c.k === 'v' && c.w === s.dataset.sample && (c.m === 'normal' || c.m === 'slow')); if (mine.length) { $$('#sheetIn .vb').forEach(x => x.classList.remove('on')); s.classList.add('on'); playClip(mine[Math.floor(Math.random() * mine.length)], () => s.classList.remove('on')); } }
});

function about() {
  openSheet(`<div class="about-top"><div class="ava">${REEM_SVG}</div><div><h2>${esc(Y.reem.name)}<span lang="ar">${Y.reem.ar}</span></h2><p>${esc(Y.reem.bio)}</p></div></div>
  <div class="sec"><p class="quote">I call you ${esc(Y.learner)} — <span lang="ar">سعيد</span>, “the happy one”. One word, one tiny phrase, zero grammar. Put me in your ears on the plane and let it sink in.</p></div>
  <div class="sec"><h3>Her friends back home · tap to hear</h3><div class="voices">${Object.entries(Y.cast).map(([id, p]) => `<button class="vb" data-sample="${id}"><span class="f">${p.emoji}</span>${esc(p.name)} <small>${esc(p.city)}</small></button>`).join('')}</div></div>
  <div class="sec"><h3>Before you fly</h3><ol class="steps"><li>Open this page once while online and wait for <b>Ready offline</b> at the top.</li><li>iPhone: Share → <b>Add to Home Screen</b>. Android: menu → <b>Install app</b>.</li><li>Lock the screen. Reem keeps talking, and the lock screen shows the current word.</li></ol></div>
  <p class="fine">Reem and her friends are AI voices, so the accent leans a little formal: they say “q” where Riyadh says “g”. The words follow your own class, weeks 1–3, plus a food round.<br>Yalla ${esc(Y.learner)} v${esc(Y.version)} · built ${esc(Y.built)} · ${ITEMS.length} words · ${Object.keys(Y.cast).length + 1} voices</p>`);
}

/* ───────────── ear test ───────────── */
let q = null, streak = 0, best = store.get('best', 0);
function paintScore() { $('#qStreak').textContent = 'Streak ' + streak; $('#qBest').textContent = 'Best ' + best; }
function newQ() {
  const i = Math.floor(Math.random() * ITEMS.length), it = ITEMS[i];
  const vs = voiceCues('lesson', i).filter(o => o.c.p === 'w').map(o => o.c);
  const others = ITEMS.filter(x => x.en !== it.en).sort(() => Math.random() - 0.5).slice(0, 3);
  q = { it, c: vs[Math.floor(Math.random() * vs.length)], done: false };
  $('#qOpts').innerHTML = [it, ...others].sort(() => Math.random() - 0.5).map(o => `<button class="qo" data-n="${o.n}">${esc(o.en)}</button>`).join('');
  $('#qRes').innerHTML = ''; $('#qNext').hidden = true; sayQ();
}
function sayQ() { if (!q) return; const p = Y.cast[q.c.w]; $('#qEmoji').textContent = p.emoji; $('#qWho').textContent = `${p.name} from ${p.city} · tap to hear again`; playClip(q.c); }
$('#qPlay').onclick = () => { if (!q || q.done) newQ(); else sayQ(); };
$('#qNext').onclick = newQ;
$('#qOpts').addEventListener('click', e => {
  const b = e.target.closest('.qo'); if (!b || !q || q.done) return; q.done = true;
  const ok = +b.dataset.n === q.it.n;
  $$('#qOpts .qo').forEach(x => { x.disabled = true; if (+x.dataset.n === q.it.n) x.classList.add('good'); }); if (!ok) b.classList.add('bad');
  streak = ok ? streak + 1 : 0; if (streak > best) { best = streak; store.set('best', best); } paintScore();
  $('#qRes').innerHTML = `<span class="a" lang="ar" dir="rtl">${q.it.v}</span><b>${esc(q.it.tl)}</b> · ${esc(q.it.en)}<br>${ok ? 'Yes! ' + q.it.emoji : 'Almost. ' + esc(q.it.hook)}`;
  $('#qNext').hidden = false; $('#qEmoji').textContent = q.it.emoji; $('#qWho').textContent = 'Tap for a new word';
});

/* ───────────── offline ───────────── */
let toastT = 0;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 3200); }
async function goOffline() {
  const pill = $('#offPill');
  const say = (txt, cls) => { pill.textContent = txt; pill.className = 'pill' + (cls ? ' ' + cls : ''); };
  if (location.protocol === 'file:' || !('caches' in window)) return say('Local copy', 'ok');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const want = Object.entries(Y.tracks).map(([k, t]) => ({ k, url: t.src + '?v=' + t.hash, bytes: t.bytes }));
  const total = want.reduce((s, w) => s + w.bytes, 0);
  let cache, got = 0, failed = false;
  try { cache = await caches.open('ys-audio'); } catch (e) { return say('Online only', 'warn'); }
  for (const r of await cache.keys()) if (!want.some(w => r.url.endsWith(w.url))) cache.delete(r);
  for (const w of want) {
    let res = await cache.match(w.url);
    if (!res) {
      try {
        const r = await fetch(w.url); if (!r.ok) throw new Error(r.status);
        const chunks = []; let n = 0;
        if (r.body && r.body.getReader) { const rd = r.body.getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); n += value.length; say(`Saving voices ${Math.round((got + n) / total * 100)}%`); } }
        else chunks.push(await r.arrayBuffer());
        const blob = new Blob(chunks, { type: 'audio/mp4' });
        await cache.put(w.url, new Response(blob, { headers: { 'Content-Type': 'audio/mp4', 'Content-Length': String(blob.size) } }));
        res = await cache.match(w.url);
      } catch (e) { failed = true; continue; }
    }
    got += w.bytes;
    try { const b = await res.blob(); blobs[w.k] = URL.createObjectURL(b.type ? b : new Blob([b], { type: 'audio/mp4' })); } catch (e) { failed = true; }
  }
  if (failed) say(Object.keys(blobs).length ? 'Partly saved' : 'Go online once', 'warn');
  else { say('Ready offline', 'ok'); if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); }
}

/* ───────────── boot ───────────── */
lockI = itemAt(now()); lockE = ITEMS[lockI].ep;
paintOpts(); drawMarks(); paintScore(); setIcons(); render(true);
goOffline();
window.__ys = { au, clip, seek, now, itemAt, state: () => ({ mode, loop, rate, pad, loaded, t: now() }) };
})();
