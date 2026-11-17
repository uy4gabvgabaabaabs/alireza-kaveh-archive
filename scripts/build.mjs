import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sqlPath = path.resolve(root, '..', 'wordpress-portal-source', 'db', 'backup.sql');
const mediaRoot = path.resolve(root, '..', 'wordpress-portal-media-all', 'uploads');
const out = path.join(root, 'dist');
const repo = 'alireza-kaveh-archive';
const base = `/${repo}`;

function parseTuples(text) {
  const rows = [];
  let row = null, value = '', quoted = false, escaped = false, depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) { value += ({n:'\n',r:'\r',t:'\t','0':'\0'}[c] ?? c); escaped = false; }
      else if (c === '\\') escaped = true;
      else if (c === "'") quoted = false;
      else value += c;
      continue;
    }
    if (c === "'") { quoted = true; continue; }
    if (c === '(') { if (depth++ === 0) { row = []; value = ''; } else value += c; continue; }
    if (c === ')' && depth) {
      if (--depth === 0) { row.push(value.trim() === 'NULL' ? null : value.trim()); rows.push(row); row = null; value = ''; }
      else value += c;
      continue;
    }
    if (c === ',' && depth === 1) { row.push(value.trim() === 'NULL' ? null : value.trim()); value = ''; continue; }
    if (depth) value += c;
  }
  return rows;
}

function tableRows(sql, table) {
  const marker = `INSERT INTO \`${table}\` VALUES `;
  const rows = [];
  let pos = 0;
  while ((pos = sql.indexOf(marker, pos)) !== -1) {
    const start = pos + marker.length;
    let quoted = false, escaped = false, end = start;
    for (; end < sql.length; end++) {
      const c = sql[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === "'") quoted = false;
      } else if (c === "'") quoted = true;
      else if (c === ';') break;
    }
    rows.push(...parseTuples(sql.slice(start, end)));
    pos = end + 1;
  }
  return rows;
}

const esc = s => String(s ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const strip = s => String(s ?? '').replace(/<!--\s*\/?wp:[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/gi, '');
const shell = (title, body) => `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — علیرضا کاوه</title><link rel="stylesheet" href="${base}/assets/style.css"></head><body><header><a href="${base}/">آرشیو علیرضا کاوه</a><nav><a href="${base}/articles/">نوشته‌ها</a><a href="${base}/pages/">صفحه‌ها</a></nav></header><main>${body}</main><footer>نسخهٔ آرشیوی مستقل از وب‌سایت علیرضا کاوه</footer></body></html>`;

const sql = fs.readFileSync(sqlPath, 'utf8');
const posts = tableRows(sql, 'wp_posts').map(r => ({id:r[0], date:r[2], content:r[4], title:r[5], excerpt:r[6], status:r[7], slug:r[11], modified:r[14], type:r[20]})).filter(p => p.status === 'publish' && ['post','page'].includes(p.type) && p.title);
fs.rmSync(out, {recursive:true, force:true});
fs.mkdirSync(path.join(out, 'assets'), {recursive:true});

const media = new Set();
for (const p of posts) {
  p.content = strip(p.content).replace(/https?:\/\/alirezakaveh\.com\/wp-content\/uploads\/([^"'?#\s<]+)/gi, (_, rel) => {
    const clean = decodeURIComponent(rel).replace(/\\/g,'/'); media.add(clean); return `${base}/wp-content/uploads/${clean}`;
  }).replace(/href="https?:\/\/alirezakaveh\.com\/?"/gi, `href="${base}/"`);
  const section = p.type === 'post' ? 'articles' : 'pages';
  // Numeric paths are stable and avoid Windows/Git path-length failures caused by
  // WordPress slugs that were already percent-encoded in the database.
  const slug = String(p.id);
  const dir = path.join(out, section, slug);
  fs.mkdirSync(dir, {recursive:true});
  fs.writeFileSync(path.join(dir, 'index.html'), shell(p.title, `<article><p class="meta">${esc(p.date?.slice(0,10))}</p><h1>${esc(p.title)}</h1>${p.content}</article>`));
  p.url = `${base}/${section}/${encodeURIComponent(slug)}/`;
}

for (const rel of media) {
  const src = path.join(mediaRoot, ...rel.split('/'));
  if (!fs.existsSync(src)) continue;
  const dest = path.join(out, 'wp-content', 'uploads', ...rel.split('/'));
  fs.mkdirSync(path.dirname(dest), {recursive:true}); fs.copyFileSync(src, dest);
}

function listing(items, heading) { return shell(heading, `<section class="hero"><p>ALIREZA KAVEH ARCHIVE</p><h1>${heading}</h1><p>${items.length.toLocaleString('fa-IR')} عنوان بازیابی‌شده از پشتیبان وردپرس</p></section><section class="grid">${items.map(p=>`<a class="card" href="${p.url}"><time>${esc(p.date?.slice(0,10))}</time><h2>${esc(p.title)}</h2><p>${esc(strip(p.excerpt).replace(/<[^>]+>/g,'').slice(0,180))}</p></a>`).join('')}</section>`); }
const articles = posts.filter(p=>p.type==='post').sort((a,b)=>String(b.date).localeCompare(String(a.date)));
const pages = posts.filter(p=>p.type==='page').sort((a,b)=>a.title.localeCompare(b.title,'fa'));
fs.mkdirSync(path.join(out,'articles'),{recursive:true}); fs.writeFileSync(path.join(out,'articles','index.html'),listing(articles,'نوشته‌ها و پژوهش‌ها'));
fs.mkdirSync(path.join(out,'pages'),{recursive:true}); fs.writeFileSync(path.join(out,'pages','index.html'),listing(pages,'صفحه‌ها و مجموعه‌ها'));
fs.writeFileSync(path.join(out,'index.html'), shell('آرشیو علیرضا کاوه', `<section class="hero"><p>CINEMA · GENRE · RESEARCH</p><h1>آرشیو علیرضا کاوه</h1><p>نوشته‌ها، کتاب‌ها و پژوهش‌های سینمایی بازیابی‌شده از نسخهٔ پشتیبان وب‌سایت.</p><div class="stats"><a href="${base}/articles/"><b>${articles.length.toLocaleString('fa-IR')}</b> نوشته</a><a href="${base}/pages/"><b>${pages.length.toLocaleString('fa-IR')}</b> صفحه</a></div></section><section><h2>تازه‌ترین نوشته‌ها</h2><div class="grid">${articles.slice(0,12).map(p=>`<a class="card" href="${p.url}"><time>${esc(p.date?.slice(0,10))}</time><h2>${esc(p.title)}</h2></a>`).join('')}</div></section>`));
fs.writeFileSync(path.join(out,'assets','style.css'), `@font-face{font-family:archive;src:local(Tahoma)}:root{--ink:#181512;--paper:#f4f0e8;--accent:#8f2d23}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:archive,Tahoma,sans-serif;line-height:1.9}header{position:sticky;top:0;z-index:4;display:flex;justify-content:space-between;gap:2rem;padding:1rem 5vw;background:#181512;color:#fff}header a{color:inherit;text-decoration:none;font-weight:700}nav{display:flex;gap:1.3rem}main{width:min(1120px,90vw);margin:auto;padding:4rem 0}.hero{padding:7vw 0;border-bottom:1px solid #bdb3a3}.hero>p:first-child{letter-spacing:.2em;color:var(--accent)}h1{font-size:clamp(2.4rem,7vw,6rem);line-height:1.1;margin:.2em 0}h2{line-height:1.35}.stats{display:flex;gap:1rem;flex-wrap:wrap;margin-top:2rem}.stats a,.card{color:inherit;text-decoration:none;border:1px solid #c9c0b2;background:#faf7f1}.stats a{padding:1rem 1.5rem}.stats b{font-size:2rem;color:var(--accent);margin-left:.5rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;margin-top:2rem}.card{display:block;padding:1.3rem;transition:.2s}.card:hover{transform:translateY(-3px);border-color:var(--accent)}.card time,.meta{font-size:.85rem;color:#766b5d}article{max-width:820px;margin:auto;font-size:1.08rem}article h1{font-size:clamp(2.2rem,6vw,4.5rem)}article img{max-width:100%;height:auto}article iframe{max-width:100%}article a{color:var(--accent)}footer{padding:2rem 5vw;background:#181512;color:#ddd;text-align:center}@media(max-width:600px){header{position:static;display:block}nav{margin-top:.5rem}main{padding-top:2rem}}`);
fs.writeFileSync(path.join(out,'.nojekyll'),'');
console.log(JSON.stringify({posts:articles.length,pages:pages.length,mediaReferenced:media.size,mediaCopied:[...media].filter(r=>fs.existsSync(path.join(mediaRoot,...r.split('/')))).length},null,2));
