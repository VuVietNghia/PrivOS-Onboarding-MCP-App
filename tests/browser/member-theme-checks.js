// Run in the local member-theme.html page through DevTools evaluate_script.
// No production/Hub transport is used. API calls and DOM state are checked together.
window.__audit = () => {
  const rgb = value => (value.match(/[\d.]+/g) || []).map(Number);
  const blend = (over, under) => {const alpha=over.length>3?over[3]:1;return over.slice(0,3).map((v,i)=>v*alpha+under[i]*(1-alpha));};
  const luminance = c => {const s=c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return s[0]*.2126+s[1]*.7152+s[2]*.0722;};
  const contrast = (a,b) => {const x=luminance(a),y=luminance(b);return +((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2);};
  const background = el => {const chain=[];while(el){chain.push(el);el=el.parentElement;}return chain.reverse().reduce((bg,node)=>blend(rgb(getComputedStyle(node).backgroundColor),bg),[255,255,255]);};
  const controls=[...document.querySelectorAll('.onboarding-v4 button,.onboarding-v4 a,.onboarding-v4 select,.onboarding-v4 input[type="file"]')].filter(el=>el.getClientRects().length).map(el=>{
    const pseudo=el.matches('input[type="file"]')?'::file-selector-button':null;
    const s=getComputedStyle(el,pseudo);let bg=background(el);if(pseudo)bg=blend(rgb(s.backgroundColor),bg);
    const colors=(s.backgroundImage.match(/rgba?\([^)]+\)/g)||[]).map(rgb);
    const samples=colors.length?colors.map(c=>blend(c,bg)):[bg];
    const fg=rgb(s.color);
    const opacity=+s.opacity;
    const ratios=samples.map(b=>contrast(blend([...fg.slice(0,3),opacity],b),b));
    return {text:(el.textContent||el.getAttribute('aria-label')||el.getAttribute('type')||'').trim(),disabled:el.disabled??false,color:s.color,background:s.backgroundColor,gradient:s.backgroundImage,font:s.fontFamily,ratio:Math.min(...ratios),opacity,outline:s.outlineStyle,outlineColor:s.outlineColor};
  });
  const failures=controls.filter(c=>c.text && c.ratio<4.5);
  return {theme:document.querySelector('.onboarding-v4')?.getAttribute('data-theme-mode'),viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,controls,failures};
};
window.__reports = [];
window.__behaviorChecks = [];
window.__tick = () => new Promise(resolve => setTimeout(resolve, 50));
window.__step = async (name) => {
  await window.__tick();
  const report = window.__audit();
  const clipped = [...document.querySelectorAll('.onboarding-v4 button')]
    .filter(element => element.getClientRects().length && element.scrollWidth > element.clientWidth + 1)
    .map(element => element.textContent);
  const row = { name, locale: document.querySelector('.onboarding-v4').lang, ...report, clipped };
  window.__reports.push(row);
  return row;
};
window.runMemberThemeChecks = async (themes = ['light', 'dark', 'brand']) => (async () => {
const f=window.__memberTheme, summaries=[],checks=[];const click=s=>{const el=document.querySelector(s);if(!el)throw new Error('MISSING '+s);if(!el.disabled)el.focus();el.click();return el;};const check=(name,value)=>{checks.push({name,pass:!!value});if(!value)throw new Error('FAILED '+name);};
for(const theme of themes) for(const locale of theme==='brand'?['en']:['vi','en']) {
f.setSurface('member');f.setTheme(theme);f.setLocale(locale);f.setScenario('ready');await window.__tick();
summaries.push(await window.__step('roadmap'));
const select=document.querySelector('main select');select.value='hire-2';select.dispatchEvent(new Event('change',{bubbles:true}));await window.__tick();check('selected-roadmap',select.value==='hire-2');
click('.v4-learning-week > button');await window.__tick();check('week-collapsed',!document.querySelector('.v4-learning-week li'));click('.v4-learning-week > button');await window.__tick();
click('.v4-learning-week li button');await window.__tick();summaries.push(await window.__step('day-unread'));
f.setGate('read','hold');const count=f.calls.read;click('.v4-learning-day article button.v4-secondary-button');await window.__tick();const pendingRead=document.querySelector('.v4-learning-day article button.v4-secondary-button');check('read-pending',pendingRead.disabled);pendingRead.click();check('read-once',f.calls.read===count+1);summaries.push(await window.__step('read-pending'));f.release('read',false);await window.__tick();check('read-error',!!document.querySelector('main [role=alert]'));summaries.push(await window.__step('read-reject'));f.setGate('read','resolve');pendingRead.click();await window.__tick();check('read-success',pendingRead.disabled);summaries.push(await window.__step('day-read'));
click('.v4-learning-day > .v4-primary-button');await window.__tick();summaries.push(await window.__step('quiz-unanswered'));
click('input[name=q1][type=radio]');click('input[name=q2][type=checkbox]');
for(const mode of ['light','dark','brand',theme]) {f.setTheme(mode);await window.__tick();check('quiz-preserves-theme-'+mode,document.querySelector('input[name=q1]:checked')&&document.querySelector('input[name=q2]:checked'));}
f.setGate('quiz','hold');const qc=f.calls.quiz;const submit=click('.v4-quiz-actionbar button');await window.__tick();check('quiz-pending',submit.disabled);submit.click();check('quiz-once',f.calls.quiz===qc+1);summaries.push(await window.__step('quiz-pending'));f.release('quiz',false);await window.__tick();check('quiz-reject-preserves',document.querySelector('input[name=q1]:checked')&&document.querySelector('main [role=alert]'));summaries.push(await window.__step('quiz-reject'));f.setGate('quiz','resolve');submit.click();await window.__tick();summaries.push(await window.__step('quiz-result'));
const retake=[...document.querySelectorAll('main button')].find(e=>/Retake|Làm lại/.test(e.textContent));check('retake-available',retake);retake.click();await window.__tick();check('retake-cleared',document.querySelector('input[name=q1]')&&!document.querySelector('input[name=q1]:checked'));click('.v4-learning-quiz > button');await window.__tick();
f.setGate('file-content','reject');click('.v4-attachment-list button');await window.__tick();check('file-open-reject',document.querySelector('.v4-attachment-list [role=alert]'));summaries.push(await window.__step('file-open-reject'));f.setGate('file-content','resolve');const opener=click('.v4-attachment-list button');await window.__tick();const focused=document.activeElement;check('dialog-focus',document.querySelector('[role=dialog]').contains(focused));
for(const mode of ['light','dark','brand',theme]) {f.setTheme(mode);await window.__tick();check('dialog-keeps-focus-'+mode,document.activeElement===focused&&document.querySelector('[role=dialog]'));}
summaries.push(await window.__step('file-preview'));
f.setGate('file-download','hold');const dc=f.calls['file-download'];const download=click('[role=dialog] footer button');await window.__tick();check('download-pending',download.disabled);download.click();check('download-once',f.calls['file-download']===dc+1);summaries.push(await window.__step('file-download-pending'));f.release('file-download',false);await window.__tick();check('download-reject',!download.disabled&&document.querySelector('[role=dialog] [role=alert]'));summaries.push(await window.__step('file-download-reject'));f.setGate('file-download','resolve');download.click();await window.__tick();check('download-retry',!download.disabled);click('[role=dialog] header button');await window.__tick();check('dialog-restores-focus',document.activeElement===opener);
}
window.__behaviorChecks=(window.__behaviorChecks||[]).concat(checks);return {summaries,checks:checks.length,failed:checks.filter(c=>!c.pass)};
})();
window.runThemeTransitionCheck = async () => {
  const results = [];
  window.__memberTheme.setTheme('light');
  await new Promise(resolve => setTimeout(resolve, 500));
  for (const theme of ['dark', 'brand', 'light']) {
    window.__memberTheme.setTheme(theme);
    for (let sample = 0; sample < 12; sample++) {
      await new Promise(resolve => setTimeout(resolve, 30));
      const nav = window.__audit().controls.find(control => /My roadmap|Lộ trình của tôi/.test(control.text));
      results.push({ theme, sample, ratio: nav.ratio });
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return { pass: results.every(result => result.ratio >= 4.5), results };
};

