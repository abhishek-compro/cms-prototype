// The workflow strip in the content toolbar: static groups product -> medical -> content -> translation -> publish, the group a content
// sits with (blinking yellow dot), green before / yellow now / white after, arrows at the two ends that move the content.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('workflow: static groups, the current one blinks, arrows move the content', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const cnt = s => b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const steps = () => b.ev(`[].map.call(document.querySelectorAll('.stage'), function(s){return s.textContent.trim() + ':' + s.className.replace('stage ','')}).join(' | ')`);
  const now = () => b.ev(`(document.querySelector('.stage.now')||{}).textContent.trim()`);
  const bg = sel => b.ev(`getComputedStyle(document.querySelector(${JSON.stringify(sel)})).backgroundColor`);
  const rgb = c => (c.match(/\d+/g) || []).slice(0, 3).map(Number);
  const idOf = n => b.ev(`Store.list().filter(function(c){return c.name===${JSON.stringify(n)}})[0].id`);
  const pick = async n => b.click('.content-item[data-id="' + await idOf(n) + '"]');

  // ---- the strip
  ok('the toolbar has five static steps in this order: Product, Medical, Content, Translation, Publish', await b.ev(`[].map.call(document.querySelectorAll('.toolbar .stage'), function(s){return s.textContent.trim()}).join('>')`) === 'Product>Medical>Content>Translation>Publish');
  ok('the last step says Publish (the UI never says Deploy)', !/deploy/i.test(await b.ev(`document.querySelector('.stages').innerText`)));
  ok('Welcome message sits with Content: Product and Medical are done, Content is now, Translation and Publish are still to come', await steps() === 'Product:done | Medical:done | Content:now | Translation:todo | Publish:todo', await steps());
  ok('the current step is marked for assistive technology and says so in its tooltip', await b.ev(`document.querySelector('.stage.now').getAttribute('aria-current')`) === 'step' && /with Content now/.test(await b.ev(`document.querySelector('.stage.now').title`)) && await cnt('.stage[aria-current]') === 1);

  // ---- dots connected by lines, the name below each dot
  ok('every step is a dot with its name BELOW it (centred under the dot)', await cnt('.stage-dot') === 5 && await b.ev(`[].every.call(document.querySelectorAll('.stage'), function(s){var d=s.querySelector('.stage-dot').getBoundingClientRect(), l=s.querySelector('.stage-label').getBoundingClientRect(); return l.top >= d.bottom - 1 && Math.abs((d.left + d.right) / 2 - (l.left + l.right) / 2) < 2 && d.width === 12 && getComputedStyle(s.querySelector('.stage-dot')).borderRadius !== '0px'})`));
  ok('the dots are in a row, left to right in the order of the steps, the same height', await b.ev(`(function(){var d=[].map.call(document.querySelectorAll('.stage-dot'), function(x){return x.getBoundingClientRect()}); return d.every(function(r,i){return i === 0 || (r.left > d[i-1].right && Math.abs(r.top - d[0].top) < 1)})})()`));
  ok('a line connects each dot to the previous one (four lines, 2px thick, running from dot to dot, behind the dots)', await b.ev(`(function(){var lis=[].slice.call(document.querySelectorAll('.stage')); return lis.every(function(li,i){ var c=getComputedStyle(li,'::before'); if(i===0) return c.content === 'none' || c.content === 'normal'; var dot=li.querySelector('.stage-dot').getBoundingClientRect(), prev=lis[i-1].querySelector('.stage-dot').getBoundingClientRect(); return c.height === '2px' && Math.abs(parseFloat(c.width) - (dot.left - prev.left)) < 2 && c.position === 'absolute' && getComputedStyle(li.querySelector('.stage-dot')).zIndex === '1'})})()`));
  ok('all the lines are gray (the colour is carried by the dots, not by the lines), and the same gray before and after the current step', await b.ev(`(function(){var lis=[].slice.call(document.querySelectorAll('.stage')), cols=lis.slice(1).map(function(l){return getComputedStyle(l,'::before').backgroundColor}); var n=cols[0].match(/\\d+/g).slice(0,3).map(Number); return cols.every(function(c){return c === cols[0]}) && Math.max.apply(null, n) - Math.min.apply(null, n) < 25})()`));

  // ---- the dot of the current step blinks
  ok('only the current step\'s dot blinks (an animation runs on it); the others are still', await b.ev(`getComputedStyle(document.querySelector('.stage.now .stage-dot')).animationName`) === 'stage-blink' && await b.ev(`getComputedStyle(document.querySelector('.stage.now .stage-dot')).animationIterationCount`) === 'infinite' && await b.ev(`[].every.call(document.querySelectorAll('.stage:not(.now) .stage-dot'), function(d){return getComputedStyle(d).animationName === 'none'})`));
  ok('the glow is slow: one blink takes about 3 seconds (not a fast flicker)', parseFloat(await b.ev(`getComputedStyle(document.querySelector('.stage.now .stage-dot')).animationDuration`)) >= 2.5);
  const o1 = await b.ev(`getComputedStyle(document.querySelector('.stage.now .stage-dot')).opacity`); await b.sleep(700); const o2 = await b.ev(`getComputedStyle(document.querySelector('.stage.now .stage-dot')).opacity`); await b.sleep(700); const o3 = await b.ev(`getComputedStyle(document.querySelector('.stage.now .stage-dot')).opacity`);
  ok('...and it really changes over time (its opacity is not constant)', new Set([o1, o2, o3]).size > 1, [o1, o2, o3].join(' '));

  // ---- the colours: green before, yellow now, white after
  const done = rgb(await bg('.stage.done .stage-dot')), nowc = rgb(await bg('.stage.now .stage-dot')), todo = rgb(await bg('.stage.todo .stage-dot'));
  ok('previous steps (their dots) are green', done[1] > done[0] + 10 && done[1] > done[2] + 10, done.join());
  ok('the current step\'s dot is yellow', nowc[0] > 230 && nowc[1] > 200 && nowc[2] < 200 && nowc[0] - nowc[2] > 60, nowc.join());
  ok('the dots of the steps still to come are white', todo.join() === '255,255,255', todo.join());
  await b.setScheme('dark');
  const nowDark = rgb(await bg('.stage.now .stage-dot')), todoDark = rgb(await bg('.stage.todo .stage-dot')), doneDark = rgb(await bg('.stage.done .stage-dot'));
  ok('the colours are theme variables: in dark mode they change, and the next steps follow the dark surface instead of white', nowDark.join() !== nowc.join() && doneDark.join() !== done.join() && todoDark.join() !== '255,255,255');
  await b.setScheme('light');

  // ---- the arrows at the extreme ends
  ok('a left arrow is before the first step and a right arrow after the last one', await b.ev(`(function(){var l=document.querySelector('[data-action=stage-back]').getBoundingClientRect(), r=document.querySelector('[data-action=stage-next]').getBoundingClientRect(), f=document.querySelector('.stage:first-child').getBoundingClientRect(), z=document.querySelector('.stage:last-child').getBoundingClientRect(); return l.right <= f.left + 1 && r.left >= z.right - 1 && true})()`));
  ok('they are named for where they lead, and are real buttons you can tab to', await b.ev(`document.querySelector('[data-action=stage-back]').getAttribute('aria-label')`) === 'Move back to Medical' && await b.ev(`document.querySelector('[data-action=stage-next]').getAttribute('aria-label')`) === 'Move on to Translation' && await b.ev(`document.querySelector('[data-action=stage-next]').tabIndex`) === 0);
  ok('the arrow buttons are vertically centred in the toolbar (not top aligned): the same centre line as the toolbar and the other buttons', await b.ev(`(function(){var tb=document.querySelector('.toolbar').getBoundingClientRect(), mid=function(r){return (r.top + r.bottom) / 2}, csv=document.querySelector('.toolbar [data-action=csv-one]').getBoundingClientRect(); var inner=tb.top + (tb.height - 1) / 2; return [].every.call(document.querySelectorAll('.stage-arrow'), function(a){var r=a.getBoundingClientRect(); return Math.abs(mid(r) - mid(csv)) < 1.5 && Math.abs(mid(r) - inner) < 1.5 && r.top - tb.top > 3})})()`));
  ok('the chevron is centred inside each oval, both ways', await b.ev(`[].every.call(document.querySelectorAll('.stage-arrow'), function(a){var r=a.getBoundingClientRect(), s=a.querySelector('svg').getBoundingClientRect(); return Math.abs((r.left + r.right) / 2 - (s.left + s.right) / 2) < 1 && Math.abs((r.top + r.bottom) / 2 - (s.top + s.bottom) / 2) < 1})`));
  ok('the arrows are oval buttons without any border (rounded all the way, a light fill instead of a line)', await b.ev(`[].every.call(document.querySelectorAll('.stage-arrow'), function(a){var s=getComputedStyle(a), r=a.getBoundingClientRect(); return ['Top','Right','Bottom','Left'].every(function(k){return s['border'+k+'Width'] === '0px'}) && parseFloat(s.borderRadius) >= r.height / 2 && r.width > r.height && s.backgroundColor !== 'rgba(0, 0, 0, 0)'})`));
  ok('the steps and their arrows are one group in the centre of the toolbar (the group is centred, not pushed to a side)', await b.ev(`(function(){var tb=document.querySelector('.toolbar').getBoundingClientRect(), g=document.querySelector('.stages').getBoundingClientRect(); return Math.abs((g.left + g.right) / 2 - (tb.left + tb.right) / 2) < 8 && g.left > tb.left + 100 && g.right < tb.right - 100})()`));
  ok('the strip fits inside the toolbar height', await b.ev(`document.querySelector('.stages').getBoundingClientRect().height <= document.querySelector('.toolbar [data-action=csv-one]').getBoundingClientRect().height + 1`));

  // ---- moving the content
  await b.click('[data-action=stage-next]');
  ok('the right arrow moves the content on to Translation: Content turns green, Translation turns yellow and gets the dot', await steps() === 'Product:done | Medical:done | Content:done | Translation:now | Publish:todo' && await q('.stage.now .stage-dot') && /Moved to Translation/.test(await txt('#toast')), await steps());
  await b.click('[data-action=stage-next]');
  ok('and on to Publish: everything before is green, the right arrow is disabled (nowhere further)', await now() === 'Publish' && await b.ev(`document.querySelector('[data-action=stage-next]').disabled`) && await cnt('.stage.done') === 4 && await cnt('.stage.todo') === 0);
  ok('the disabled arrow says why', /Already with the last group/.test(await b.ev(`document.querySelector('[data-action=stage-next]').title`)));
  await b.click('[data-action=stage-back]'); await b.click('[data-action=stage-back]'); await b.click('[data-action=stage-back]');
  ok('the left arrow moves it back, one group at a time: Medical is now yellow and Content, Translation, Publish are white', await steps() === 'Product:done | Medical:now | Content:todo | Translation:todo | Publish:todo', await steps());
  await b.click('[data-action=stage-back]');
  ok('back at Product: nothing is green, the left arrow is disabled', await now() === 'Product' && await b.ev(`document.querySelector('[data-action=stage-back]').disabled`) && await cnt('.stage.done') === 0 && /first group/.test(await b.ev(`document.querySelector('[data-action=stage-back]').title`)));
  await b.click('[data-action=stage-back]').catch(() => {});
  ok('a disabled arrow does nothing', await now() === 'Product');

  // ---- every content has its own group
  await pick('Appointment reminder');
  ok('another content shows its own group (Appointment reminder sits with Medical)', await now() === 'Medical' && await cnt('.stage.done') === 1);
  await pick('Daily health tip');
  ok('and a new sample sits with Product', await now() === 'Product');
  await b.click('[data-action=open-add]'); await b.type('Fresh content'); await b.click('.add-confirm');
  ok('a content you create starts with the first group (Product)', await now() === 'Product' && await cnt('.stage.done') === 0);
  await pick('Welcome message');
  ok('Welcome message is still where it was left (Product)', await now() === 'Product');
  await b.click('[data-action=stage-next]'); await b.click('[data-action=stage-next]');
  ok('moving one content does not move the others', await now() === 'Content');
  await pick('Appointment reminder');
  ok('(Appointment reminder is still with Medical)', await now() === 'Medical');
  await pick('Welcome message');

  // ---- history, and it is saved
  await b.click('[data-action=toggle-history-pane]');
  await b.click('.hp-tab[data-tab=other]');
  const other = await b.ev(`[].map.call(document.querySelectorAll('#history-pane .event'), function(e){return e.innerText.replace(/\\s+/g,' ')}).join(' ; ')`);
  ok('every move is in the Other tab with who and when: "Moved to Medical", "Moved to Content"', /Moved to Medical/.test(other) && /Moved to Content/.test(other) && /Demo user/.test(other), other.slice(0, 300));
  await b.click('.hp-tab[data-tab=content]');
  ok('but not in the Content tree (a move is not a content change and cannot be rewound to)', !/Moved to/.test(await txt('#history-pane .tree')));
  await b.click('[data-action=toggle-history-pane]');
  await b.reload();
  ok('after a reload the content is still with the same group', await now() === 'Content');

  // ---- the publish button is gone
  ok('the Publish button was removed from the toolbar (the last group is how the workflow ends)', !await q('[data-action=deploy-all]') && !await q('.toolbar .btn.deploy') && !/Publish all/.test(await txt('.toolbar')));
});
