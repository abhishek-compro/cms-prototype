// The header media of a language is a (dummy) CDN link. A hand-written link is shown as a tile with the file name; a file uploaded with the
// pencil on the picture is stored as data in IndexedDB under a randomly generated dummy CDN link and shown from there. Nothing is fetched.
'use strict';
const { uiSuite } = require('../lib/harness');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

uiSuite('header media: a dummy CDN link; the pencil uploads a file kept in IndexedDB; nothing is fetched', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const cnt = s => b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const attr = (s, a) => b.ev(`(document.querySelector(${JSON.stringify(s)})||document.body).getAttribute(${JSON.stringify(a)}) || ''`);
  const val = s => b.ev(`document.querySelector(${JSON.stringify(s)}).value`);
  const E = s => '.panel.edit ' + s;
  const setType = v => b.ev(`(function(){var s=document.querySelector('.panel.edit [data-change=set-header-type]'); s.value=${JSON.stringify(v)}; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`);
  const probs = () => txt(E('[data-sec=problems]'));
  const saved = () => b.ev(`Store.partsOf(Store.list()[0].translations[0]).header`);
  const EN = 'https://cdn.noorahealth.org/templates/welcome-en.png';
  const LINK = /^https:\/\/cdn\.noorahealth\.org\/templates\/[0-9a-f]{16}\.(png|jpg|mp4|pdf)$/;
  // what is in IndexedDB: the keys of the stored files
  const idbKeys = () => b.ev(`new Promise(function(res){ var r = indexedDB.open('cms-prototype-media', 1); r.onupgradeneeded = function(){ r.result.createObjectStore('files', {keyPath:'url'}); }; r.onerror = function(){ res(null) }; r.onsuccess = function(){ var db = r.result, g = db.transaction('files').objectStore('files').getAllKeys(); g.onsuccess = function(){ db.close(); res(g.result) }; g.onerror = function(){ db.close(); res(null) } } })`);
  const noNetwork = () => b.ev(`performance.getEntriesByType('resource').every(function(e){return /^(file|blob|data):/.test(e.name)})`);
  // choose a file in the (hidden) file input the way the browser does after its dialog: set .files, fire change
  const upload = async (name, type, opts = {}) => {
    await b.ev(`(function(){
      var bytes = ${opts.png ? `Uint8Array.from(atob('${PNG}'), function(c){return c.charCodeAt(0)})` : `new Uint8Array(${opts.size === undefined ? 64 : opts.size})`};
      var f = new File([bytes], ${JSON.stringify(name)}, {type: ${JSON.stringify(type)}});
      var dt = new DataTransfer(); dt.items.add(f);
      var i = document.querySelector('.panel.edit .file-input'); i.files = dt.files; i.dispatchEvent(new Event('change', {bubbles:true})); return 1})()`);
    await b.sleep(150);
  };
  const waitFor = async (fn, ms = 3000) => { for (let t = 0; t < ms; t += 50) { if (await fn()) return true; await b.sleep(50); } return false; };

  // ---- the sample: a dummy CDN link shown as a tile
  ok('the English header is the sample (dummy) CDN link: the bubble shows a tile with the file name, the link as its tooltip', await q(E('.wa-bubble .wa-media-image.linked')) && /welcome-en\.png/.test(await txt(E('.wa-media-image .wa-media-name'))) && await attr(E('.wa-media-image'), 'title') === EN && /welcome-en\.png/.test(await txt(E('.wa-hnote'))));
  ok('nothing is fetched: no image, video, frame or external resource is in the page, and no request left it', await cnt('img, video, audio, iframe, source, embed, object') === 0 && await noNetwork());
  ok('the link is edited below the phone, labelled as a CDN link, not inside the bubble', await val(E('[data-input=header]')) === EN && /Media link/.test(await txt(E('[data-sec=header-url]'))) && !await q(E('.phone [data-input=header]')));
  ok('the header type dropdown, its limits and the Remove header button are below the phone (the only control in the bubble is the cross on the picture)', await q(E('[data-sec=header-url] [data-change=set-header-type]')) && /JPEG or PNG, up to 5 MB/.test(await txt(E('[data-sec=header-url]'))) && await q(E('[data-sec=header-url] [data-action=remove-header]')) && !await q(E('.phone [data-change=set-header-type]')) && await cnt(E('.phone [data-action=remove-header]')) === 1 && await q(E('.wa-hbtns .wa-remove')));
  ok('there is no "Replace image" button: the only way to upload is the pencil on the picture', !/Replace|Upload/i.test(await b.ev(`document.querySelector('.panel.edit').innerText`)) && await cnt(E('.wa-edit:not(.wa-remove)')) === 1);

  // ---- the pencil
  ok('the pencil and the cross are hidden until you hover the picture', await b.ev(`getComputedStyle(document.querySelector('.panel.edit .wa-hbtns')).opacity`) === '0');
  await b.hover(E('.wa-part-header .wa-media'));
  ok('hovering the picture shows a pencil and, beside it, a cross in its top right corner (cross in the corner)', await b.ev(`getComputedStyle(document.querySelector('.panel.edit .wa-hbtns')).opacity`) === '1' && await b.ev(`(function(){var p=document.querySelector('.panel.edit .wa-edit:not(.wa-remove)').getBoundingClientRect(), x=document.querySelector('.panel.edit .wa-remove').getBoundingClientRect(), m=document.querySelector('.panel.edit .wa-part-header .wa-media').getBoundingClientRect(); return x.top >= m.top - 2 && x.top - m.top < 24 && m.right - x.right < 24 && x.right <= m.right + 2 && p.right <= x.left && x.left - p.right < 12 && Math.abs(p.top - x.top) < 2})()`));
  await b.ev(`window.__fileClicks = 0; HTMLInputElement.prototype.click = (function(orig){ return function(){ if (this.type === 'file') { window.__fileClicks++; return; } return orig.call(this); }; })(HTMLInputElement.prototype.click); 0`);
  await b.click(E('.wa-edit'));
  ok('clicking the pencil opens the file dialog (a file input that only offers what WhatsApp accepts for an image)', await b.ev(`window.__fileClicks`) === 1 && /image\/jpeg/.test(await attr(E('.file-input'), 'accept')) && /\.png/.test(await attr(E('.file-input'), 'accept')) && !/video|pdf/.test(await attr(E('.file-input'), 'accept')));
  await b.key('Tab', 'Tab', 9);
  ok('the pencil and the cross are reachable from the keyboard (only transparent, not hidden)', await b.ev(`document.querySelector('.panel.edit .wa-edit:not(.wa-remove)').tabIndex`) === 0 && await b.ev(`document.querySelector('.panel.edit .wa-remove').tabIndex`) === 0 && await b.ev(`getComputedStyle(document.querySelector('.panel.edit .wa-remove')).visibility`) === 'visible');

  // ---- typing a link by hand
  await b.fill(E('[data-input=header]'), 'https://cdn.example.org/new/baby.png');
  ok('typing a link: the field keeps focus and the tile shows the new file name at once', await b.ev(`document.activeElement.getAttribute('data-input')`) === 'header' && /baby\.png/.test(await txt(E('.wa-media-image .wa-media-name'))) && await attr(E('.wa-media-image'), 'title') === 'https://cdn.example.org/new/baby.png');
  await b.click(E('.revert'));
  ok('Revert puts the saved link back', await val(E('[data-input=header]')) === EN);

  // ---- an upload
  ok('before any upload nothing is in IndexedDB', JSON.stringify(await idbKeys()) === '[]');
  await upload('baby.png', 'image/png', { png: true });
  const link = await val(E('[data-input=header]'));
  ok('an uploaded image gets a randomly generated dummy CDN link that keeps the extension, and the link field shows it', LINK.test(link) && /\.png$/.test(link) && link !== EN, link);
  ok('the bubble shows the real picture (from local data, not from the link), with no tile', await q(E('.wa-bubble .wa-media-file img.wa-img')) && /^blob:/.test(await attr(E('.wa-img'), 'src')) && await b.ev(`document.querySelector('.panel.edit .wa-img').naturalWidth`) === 1 && !await q(E('.wa-media.linked')));
  ok('under the picture: the file name and size', /baby\.png · 1 KB/.test(await txt(E('.wa-hnote'))), await txt(E('.wa-hnote')));
  ok('the file is stored as data in IndexedDB under that link', JSON.stringify(await idbKeys()) === JSON.stringify([link]));
  ok('the language is marked edited (Save enabled); nothing is saved yet', !await b.ev(`document.querySelector('.panel.edit .save').disabled`) && await saved() === EN);
  ok('still nothing was requested from the network', await noNetwork());
  await b.click(E('.save'));
  ok('saving stores the link as the language\'s header', await saved() === link);
  await b.reload();
  ok('after a reload the picture comes back from IndexedDB', await waitFor(() => q(E('.wa-bubble img.wa-img'))) && await val(E('[data-input=header]')) === link && /^blob:/.test(await attr(E('.wa-img'), 'src')));
  await upload('second.png', 'image/png', { png: true });
  const link2 = await val(E('[data-input=header]'));
  ok('uploading another file gives another random link (the first stays stored)', LINK.test(link2) && link2 !== link && (await idbKeys()).length === 2);
  await b.click(E('.revert'));

  // ---- refused files
  await upload('notes.pdf', 'application/pdf');
  ok('a PDF is refused for an image header, with the reason; the header is unchanged', /not allowed.*JPEG or PNG/.test(await txt('#toast')) && await val(E('[data-input=header]')) === link, await txt('#toast'));
  await upload('huge.png', 'image/png', { size: 5 * 1024 * 1024 + 1 });
  ok('a picture over 5 MB is refused, saying the limit', /5 MB/.test(await txt('#toast')) && await val(E('[data-input=header]')) === link, await txt('#toast'));
  await upload('empty.png', 'image/png', { size: 0 });
  ok('an empty file is refused', /empty/.test(await txt('#toast')));
  ok('refused files are not stored', (await idbKeys()).length === 2);

  // ---- not a link / the wrong kind of file
  await b.fill(E('[data-input=header]'), '3f2b8c1e-9a47-4d6b-8c3e-1f5a7b9d2e40');
  ok('an old-style id is a problem (saving still allowed); the bubble falls back to the plain image box without a file name', /link to the file on the CDN, starting with https/.test(await probs()) && await q(E('.wa-media-image')) && !await q(E('.wa-media-image.linked')) && !await b.ev(`document.querySelector('.panel.edit .save').disabled`));
  await b.fill(E('[data-input=header]'), 'https://cdn.example.org/guide.pdf');
  ok('a PDF link for an image header is a problem that names the file and the header type', /a document \(guide\.pdf\), but the header type is image/.test(await probs()), await probs());
  await b.fill(E('[data-input=header]'), 'https://cdn.example.org/media/abc123');
  ok('a link with no extension is accepted (the extension is only checked when there is one)', !/Header/.test(await probs()) && await attr(E('.wa-media-image'), 'title') === 'https://cdn.example.org/media/abc123');
  await b.click(E('.revert'));

  // ---- the header type decides how a file or link is shown
  await setType('video');
  ok('changing the type to Video: the uploaded PNG is now the wrong kind (problem), hint and placeholder follow the type', /an image \(.*\.png\), but the header type is video/.test(await probs()) && /MP4 or 3GPP, up to 16 MB/.test(await txt(E('[data-sec=header-url]'))) && /\.mp4$/.test(await attr(E('[data-input=header]'), 'placeholder')));
  ok('the pencil now offers only video files', /video\/mp4/.test(await attr(E('.file-input'), 'accept')));
  await upload('clip.mp4', 'video/mp4', { size: 2048 });
  ok('an MP4 is shown with a video player (local data), a random .mp4 link, and the problem is gone', LINK.test(await val(E('[data-input=header]'))) && /\.mp4$/.test(await val(E('[data-input=header]'))) && await q(E('.wa-bubble video.wa-img[controls]')) && /^blob:/.test(await attr(E('video.wa-img'), 'src')) && !/Header/.test(await probs()));
  await upload('pic.png', 'image/png', { png: true });
  ok('an image is refused for a video header', /not allowed.*MP4 or 3GPP/.test(await txt('#toast')), await txt('#toast'));
  await b.click(E('.save'));
  await setType('document');
  ok('switching to Document: the MP4 link is the wrong kind', /a video \(.*\.mp4\), but the header type is document/.test(await probs()), await probs());
  await upload('guide.pdf', 'application/pdf', { size: 4096 });
  ok('a PDF is shown as a document row with its name and size', await q(E('.wa-bubble .wa-doc')) && /guide\.pdf/.test(await txt(E('.wa-doc-name'))) && /PDF · 4 KB/.test(await txt(E('.wa-doc'))) && /\.pdf$/.test(await val(E('[data-input=header]'))) && !/Header/.test(await probs()));
  await b.click(E('.save'));
  ok('still nothing was requested from the network', await noNetwork());

  // ---- the read-only reference panel shows the other language's header too
  await b.click('[data-change=toggle-side]');
  ok('in side by side, the reference phone shows its language\'s header, read-only (no pencil)', await q('.panel.ref .phone .wa-bubble .wa-media, .panel.ref .phone .wa-bubble .wa-doc') && !await q('.panel.ref input, .panel.ref textarea') && !await q('.panel.ref .wa-edit'));
  await b.click('[data-change=toggle-side]');

  // ---- the cross on the picture removes the header
  await b.hover(E('.wa-part-header .wa-media, .wa-part-header .wa-doc'));
  await b.click(E('.wa-remove'));
  ok('the cross removes the header from every language (the same as "Remove header" below the phone)', !await q(E('[data-sec=header]')) && !await q(E('[data-sec=header-url] [data-input=header]')) && await b.ev(`Store.list()[0].headerType`) === 'none' && /Header removed from every language/.test(await txt('#toast')));

  // ---- reset forgets uploaded files
  await b.ev(`window.confirm = function(){return true}; 0`);
  await b.click('[data-action=reset]');
  ok('Reset demo data forgets the uploaded files (IndexedDB is emptied) and brings back the sample link', JSON.stringify(await idbKeys()) === '[]' && await val(E('[data-input=header]')) === EN);

  // ---- dark theme
  const bubbleBg = () => b.ev(`getComputedStyle(document.querySelector('.panel.edit .wa-bubble')).backgroundColor`);
  await b.setScheme('light'); const lightBg = await bubbleBg();
  await b.setScheme('dark'); const darkBg = await bubbleBg();
  ok('the phone you edit in uses theme colours (the bubble differs in dark mode)', lightBg !== darkBg, lightBg + ' / ' + darkBg);
  await b.setScheme('light');
});
