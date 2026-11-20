// Uploading the header file (image / video / document) of a language and previewing it while editing.
'use strict';
const { uiSuite } = require('../lib/harness');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

uiSuite('header media: upload a file, see it in the phone you are editing, and in the reference panel', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const cnt = s => b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const attr = (s, a) => b.ev(`(document.querySelector(${JSON.stringify(s)})||document.body).getAttribute(${JSON.stringify(a)}) || ''`);
  const val = s => b.ev(`document.querySelector(${JSON.stringify(s)}).value`);
  const E = s => '.panel.edit ' + s;
  // choose a file in the (hidden) file input the way the browser does after its file dialog: set .files, fire change
  const upload = async (name, type, opts = {}) => {
    await b.ev(`(function(){
      var bytes = ${opts.png ? `Uint8Array.from(atob('${PNG}'), function(c){return c.charCodeAt(0)})` : `new Uint8Array(${opts.size || 64})`};
      var f = new File([bytes], ${JSON.stringify(name)}, {type: ${JSON.stringify(type)}});
      var dt = new DataTransfer(); dt.items.add(f);
      var i = document.querySelector('.panel.edit .file-input'); i.files = dt.files; i.dispatchEvent(new Event('change', {bubbles:true})); return 1})()`);
    await b.sleep(250);
  };
  const saved = () => b.ev(`Store.partsOf(Store.list()[0].translations[0]).header`);

  // ---- the editor
  ok('the English header shows the sample media id: no file to preview, said plainly', await q(E('[data-sec=header] .wa-media-image')) && /nothing to preview/.test(await txt(E('[data-sec=header] .wa-hnote'))));
  ok('the sample id counts as a header, so the button says Replace image; the allowed types and size are written next to it', /Replace image/.test(await txt(E('[data-action=pick-header]'))) && /JPEG or PNG, up to 5 MB/.test(await txt(E('.wa-hctl'))));
  ok('the file input only offers what WhatsApp accepts for an image header', /image\/jpeg/.test(await attr(E('.file-input'), 'accept')) && /\.png/.test(await attr(E('.file-input'), 'accept')) && !/video|pdf/.test(await attr(E('.file-input'), 'accept')));

  // ---- upload an image
  await upload('baby.png', 'image/png', { png: true });
  ok('the uploaded image is shown in the bubble you are editing, straight away', await q(E('.wa-bubble .wa-media-file img.wa-img')) && /^data:image\/png/.test(await attr(E('.wa-img'), 'src')) && await b.ev(`document.querySelector('.panel.edit .wa-img').naturalWidth`) === 1);
  ok('its name and size are shown, the button now says Replace image, and Remove file appears', /baby\.png/.test(await txt(E('.wa-hnote'))) && /Replace image/.test(await txt(E('[data-action=pick-header]'))) && await q(E('[data-action=clear-header-file]')));
  ok('the media id field holds the new id; the language is marked edited (Save enabled) and nothing is saved yet', /^[0-9a-f-]{36}$/.test(await val(E('[data-input=header]'))) && !await b.ev(`document.querySelector('.panel.edit .save').disabled`) && await saved() === '3f2b8c1e-9a47-4d6b-8c3e-1f5a7b9d2e40');
  ok('there is no Preview button or dialog: the editor is the phone', !await q('[data-action=preview]') && !await q('.modal') && await q(E('.phone')));
  await b.click(E('.save'));
  ok('saving stores the media id as the language\'s header', await saved() === await val(E('[data-input=header]')) && /^[0-9a-f-]{36}$/.test(await saved()));
  await b.reload();
  ok('after a reload the picture is still there (small files are kept)', await q(E('.wa-img')) && await b.ev(`document.querySelector('.panel.edit .wa-img').naturalWidth`) === 1);

  // ---- editing the id by hand updates the preview
  const id = await saved();
  await b.fill(E('[data-input=header]'), 'some-other-id');
  ok('typing another id shows that nothing is known about it, without losing the field\'s focus', /nothing to preview/.test(await txt(E('.wa-hnote'))) && !await q(E('.wa-img')) && await b.ev(`document.activeElement.getAttribute('data-input')`) === 'header');
  await b.fill(E('[data-input=header]'), id);
  ok('typing the id of an uploaded file brings its preview back', await q(E('.wa-img')));
  await b.click(E('.revert'));

  // ---- rejected files
  await upload('notes.pdf', 'application/pdf');
  ok('a PDF is refused for an image header, with the reason; the header is unchanged', /not allowed.*JPEG or PNG/.test(await txt('#toast')) && await val(E('[data-input=header]')) === id, await txt('#toast'));
  await upload('huge.png', 'image/png', { size: 5 * 1024 * 1024 + 1 });
  ok('a picture over 5 MB is refused, saying the limit', /5 MB/.test(await txt('#toast')) && await val(E('[data-input=header]')) === id, await txt('#toast'));
  await upload('empty.png', 'image/png', { size: 0 });
  ok('an empty file is refused', /empty/.test(await txt('#toast')));

  // ---- remove the file
  await b.click(E('[data-action=clear-header-file]'));
  ok('Remove file clears the header: the plain image box shows, Upload image is back, the id field is empty', await q(E('.wa-media-image')) && /No image uploaded yet/.test(await txt(E('.wa-hnote'))) && /Upload image/.test(await txt(E('[data-action=pick-header]'))) && await val(E('[data-input=header]')) === '' && !await q(E('[data-action=clear-header-file]')));
  await b.click(E('.revert'));

  // ---- a video header
  await b.ev(`(function(){var s=document.querySelector('.panel.edit [data-change=set-header-type]'); s.value='video'; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`);
  ok('changing the header type to Video changes what can be uploaded: button, hint and accepted files', /Replace video/.test(await txt(E('[data-action=pick-header]'))) && /MP4 or 3GPP, up to 16 MB/.test(await txt(E('.wa-hctl'))) && /video\/mp4/.test(await attr(E('.file-input'), 'accept')));
  await upload('clip.mp4', 'video/mp4', { size: 2048 });
  ok('an MP4 is previewed with a video player', await q(E('.wa-bubble video.wa-img[controls]')));
  await upload('pic.png', 'image/png', { png: true });
  ok('an image is refused for a video header', /not allowed.*MP4 or 3GPP/.test(await txt('#toast')), await txt('#toast'));
  await b.click(E('.save'));

  // ---- a document header
  await b.ev(`(function(){var s=document.querySelector('.panel.edit [data-change=set-header-type]'); s.value='document'; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`);
  ok('switching the type leaves a video as the header file of a Document header: that is a problem (saving still allowed)', /clip\.mp4 is a video, but the header type is document/.test(await txt(E('[data-sec=problems]'))), await txt(E('[data-sec=problems]')));
  await upload('guide.pdf', 'application/pdf', { size: 4096 });
  ok('a PDF is shown as a document card with its name and size', /guide\.pdf/.test(await txt(E('.wa-doc'))) && /4 KB/.test(await txt(E('.wa-doc'))));
  ok('the problem is gone now the file matches the type', !/header file/.test(await txt(E('[data-sec=problems]'))));
  ok('the bubble shows a document row with the name', await q(E('.wa-bubble .wa-doc')) && /guide\.pdf/.test(await txt(E('.wa-doc-name'))));
  await b.click(E('.save'));

  // ---- the read-only reference panel previews too
  await b.click('[data-change=toggle-side]');
  ok('in side by side, the reference language shows its header media too', await q('.panel.ref .phone .wa-bubble .wa-media') && !await q('.panel.ref input, .panel.ref textarea'));
  await b.click('[data-change=toggle-side]');

  // ---- dark theme
  const bubbleBg = () => b.ev(`getComputedStyle(document.querySelector('.panel.edit .wa-bubble')).backgroundColor`);
  await b.setScheme('light'); const lightBg = await bubbleBg();
  await b.setScheme('dark'); const darkBg = await bubbleBg();
  ok('the phone you edit in uses theme colours (the bubble differs in dark mode)', lightBg !== darkBg, lightBg + ' / ' + darkBg);
  await b.setScheme('light');
});
