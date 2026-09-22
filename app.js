(function(){
  'use strict';

  const rawSongs = Array.isArray(window.SONGS) ? window.SONGS : [];
  const SONGS = rawSongs
    .filter(song => song && Number.isFinite(Number(song.num)) && Number(song.num) > 0)
    .map(song => ({
      ...song,
      num: Number(song.num),
      title: String(song.title ?? '').trim(),
      lyrics: String(song.lyrics ?? ''),
      tags: Array.isArray(song.tags) ? song.tags.map(String) : []
    }))
    .sort((a,b) => a.num - b.num);

  const SONG_MAP = new Map(SONGS.map(song => [song.num, song]));
  const INDEX_TOTAL = Math.max(500, ...SONGS.map(song => song.num), 500);
  const AVAILABLE_NUMBERS = new Set(SONGS.map(song => song.num));
  const SONG_TITLES = new Map(SONGS.map(song => [song.num, song.title]));
  const STORAGE = {
    scale: 'athmeeya-reader-scale',
    speed: 'athmeeya-auto-speed',
    installSeen: 'athmeeya-install-prompt-seen-v21'
  };
  const state = {
    query: '',
    indexQuery: '',
    suggestionIndex: -1,
    view: 'home',
    activeTab: 'numbers',
    readerScale: 1,
    currentSong: null,
    autoScrolling: false,
    autoSpeed: 0.8
  };

  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const search = $('search-input');
  const clearSearch = $('clear-search');
  const menuSearch = $('menu-search');
  const feed = $('song-feed');
  const sheet = $('index-sheet');
  const overlay = $('menu-overlay');
  const readerOverlay = $('reader-overlay');
  const settingsSheet = $('settings-sheet');
  const settingsBackdrop = $('settings-backdrop');
  let toastTimer = 0;
  let searchTimer = 0;
  let navigationToken = 0;
  let activeNavigationNumber = null;
  let autoTimer = 0;
  let deferredInstallPrompt = null;
  let installProgressTimer = 0;
  let installFailSafeTimer = 0;
  const READER_MIN = .82;
  const READER_MAX = 1.18;
  const READER_STEP = .06;

  const normalize = value => String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g,'')
    .replace(/\s+/g,' ')
    .trim()
    .toLocaleLowerCase('ml');

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  function showToast(message){
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>toast.classList.remove('show'), 2300);
  }

  function isStandalone(){
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function isIOS(){
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function siteUrl(){
    return new URL('./', location.href).href;
  }

  function hasSeenInstallPrompt(){
    try{return localStorage.getItem(STORAGE.installSeen)==='1';}catch(_){return false;}
  }

  function markInstallPromptSeen(){
    try{localStorage.setItem(STORAGE.installSeen,'1');}catch(_){ }
  }

  function updateInstallAvailability(){
    const modal=$('install-modal');
    const now=$('install-now');
    if(!modal || !now) return;
    const standalone=isStandalone();
    const hasNativePrompt=!!deferredInstallPrompt;
    modal.dataset.state=standalone ? 'done' : 'ready';
    $('install-badge-text').textContent=standalone ? 'INSTALLED' : (hasNativePrompt ? 'READY TO INSTALL' : 'APP READY');
    $('install-copy').textContent=standalone
      ? 'Athmeeya Geethangal is already installed on this device.'
      : hasNativePrompt
        ? 'This browser supports one-tap installation. Tap Install Now to add Athmeeya Geethangal to your device.'
        : isIOS()
          ? 'Add Athmeeya Geethangal to your Home Screen from Safari for the full app experience.'
          : 'Install Athmeeya Geethangal from this browser to keep the hymn library one tap away.';
    now.disabled=standalone;
    now.textContent=standalone ? 'Already Installed' : 'Install Now';
  }

  function resetInstallDialog(){
    const modal=$('install-modal');
    if(!modal)return;
    clearInterval(installProgressTimer);
    clearTimeout(installFailSafeTimer);
    $('install-progress-wrap').hidden=true;
    $('install-hint').hidden=true;
    $('install-actions').hidden=false;
    $('install-now').disabled=false;
    $('install-now').textContent='Install Now';
    updateInstallAvailability();
  }

  function openInstallModal(options={}){
    const modal=$('install-modal');
    if(!modal)return;
    clearInterval(installProgressTimer);
    clearTimeout(installFailSafeTimer);
    resetInstallDialog();
    if(options.auto) markInstallPromptSeen();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    document.body.classList.add('install-open');
    setTimeout(()=>{try{$('install-now').focus({preventScroll:true});}catch(_){ }},120);
  }

  function closeInstallModal({remember=true}={}){
    const modal = $('install-modal');
    if(!modal) return;
    clearInterval(installProgressTimer);
    clearTimeout(installFailSafeTimer);
    if(remember) markInstallPromptSeen();
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
    delete modal.dataset.state;
    document.body.classList.remove('install-open');
  }

  function setInstallProgress(value,label){
    const pct = Math.max(0,Math.min(100,Math.round(value)));
    $('install-progress-bar').style.width = `${pct}%`;
    $('install-progress-value').textContent = `${pct}%`;
    $('install-progress-label').textContent = label;
  }

  function showInstallHint(html){
    const hint = $('install-hint');
    hint.innerHTML = html;
    hint.hidden = false;
  }

  function finishInstallSuccess(){
    const modal = $('install-modal');
    if(!modal) return;
    clearInterval(installProgressTimer);
    clearTimeout(installFailSafeTimer);
    markInstallPromptSeen();
    setInstallProgress(100,'Installation complete');
    modal.dataset.state='done';
    $('install-badge-text').textContent='INSTALLED';
    $('install-copy').textContent='Athmeeya Geethangal is now installed and ready to open from your device.';
    $('install-actions').hidden=false;
    $('install-now').disabled=true;
    $('install-now').textContent='Installed';
    showInstallHint('You can now open Athmeeya Geethangal from your device like a normal app.');
    showToast('Athmeeya Geethangal installed');
  }

  function showIOSInstallSteps(){
    const modal=$('install-modal');
    modal.dataset.state='done';
    markInstallPromptSeen();
    $('install-badge-text').textContent='ONE MORE STEP';
    $('install-copy').textContent='Complete the Home Screen install from Safari.';
    $('install-actions').hidden=false;
    $('install-now').disabled=false;
    $('install-now').textContent='Show Install Steps';
    showInstallHint('<b>iPhone / iPad</b><br>1. Open this page in <b>Safari</b>.<br>2. Tap <b>Share</b>.<br>3. Choose <b>Add to Home Screen</b>.<br>4. Tap <b>Add</b>.');
  }

  function showBrowserInstallSteps(){
    const modal=$('install-modal');
    modal.dataset.state='done';
    markInstallPromptSeen();
    $('install-badge-text').textContent='INSTALL FROM BROWSER';
    $('install-copy').textContent='Your browser does not expose the one-tap install prompt. Use the browser menu to add Athmeeya Geethangal to your device.';
    $('install-actions').hidden=false;
    $('install-now').disabled=false;
    $('install-now').textContent='Show Install Steps';
    showInstallHint('<b>Android / Desktop</b><br>Open the browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>. Make sure you have a good internet connection while installing.');
  }

  async function startInstall(){
    const modal=$('install-modal');
    if(!modal || modal.dataset.state==='installing')return;
    markInstallPromptSeen();
    if(isStandalone()){finishInstallSuccess();return;}

    if(isIOS() && !deferredInstallPrompt){showIOSInstallSteps();return;}
    if(!deferredInstallPrompt){showBrowserInstallSteps();return;}

    modal.dataset.state='installing';
    $('install-actions').hidden=true;
    $('install-progress-wrap').hidden=false;
    $('install-hint').hidden=true;
    $('install-badge-text').textContent='INSTALLING';
    $('install-copy').textContent='Preparing Athmeeya Geethangal for installation on your device.';

    let progress=5;
    const started=Date.now();
    setInstallProgress(progress,'Preparing installation…');
    clearInterval(installProgressTimer);
    installProgressTimer=setInterval(()=>{
      const elapsed=Date.now()-started;
      const next=Math.min(82,5+(elapsed/900)*77);
      progress=Math.max(progress,next);
      setInstallProgress(progress,progress<30?'Checking app package…':progress<60?'Preparing app files…':'Preparing device installer…');
    },60);

    await new Promise(resolve=>setTimeout(resolve,700));
    try{
      const promptEvent=deferredInstallPrompt;
      deferredInstallPrompt=null;
      setInstallProgress(88,'Opening device install prompt…');
      await promptEvent.prompt();
      const choice=await promptEvent.userChoice;
      if(choice?.outcome==='accepted'){
        setInstallProgress(96,'Finishing installation…');
        installFailSafeTimer=setTimeout(()=>{
          if(!isStandalone()){
            clearInterval(installProgressTimer);
            modal.dataset.state='ready';
            $('install-actions').hidden=false;
            $('install-progress-wrap').hidden=true;
            updateInstallAvailability();
            showToast('Installation requested by the browser');
          }else finishInstallSuccess();
        },1200);
        return;
      }
      throw new Error('Install dismissed');
    }catch(err){
      clearInterval(installProgressTimer);
      clearTimeout(installFailSafeTimer);
      modal.dataset.state='ready';
      $('install-actions').hidden=false;
      $('install-progress-wrap').hidden=true;
      $('install-hint').hidden=true;
      updateInstallAvailability();
      if(err?.message==='Install dismissed') showToast('Installation cancelled');
      else showToast('Installation could not be completed');
    }
  }

  function cleanLyrics(text){
    return String(text ?? '')
      .replace(/\r\n?/g,'\n')
      .replace(/[\u200B-\u200D\uFEFF]/g,'')
      .split('\n')
      .map(line => line.replace(/[ \t]+$/g,''))
      .join('\n')
      .replace(/^\n+|\n+$/g,'')
      .replace(/\n{3,}/g,'\n\n');
  }

  function icon(name){
    const paths = {
      share:'<path d="M12 15V4m0 0 3.5 3.5M12 4 8.5 7.5M6 12.5v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-6"/>',
      copy:'<rect x="8" y="8" width="10" height="11" rx="2"/><path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"/>',
      read:'<path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 0-4-4V4Z"/><path d="M9 20V8a4 4 0 0 0-4-4"/>',
      download:'<path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/>',
      arrow:'<path d="M5 12h13M13 6l6 6-6 6"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
  }

  function youtubeIcon(){
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.58 7.19a2.97 2.97 0 0 0-2.09-2.1C17.65 4.6 12 4.6 12 4.6s-5.65 0-7.49.49a2.97 2.97 0 0 0-2.09 2.1C1.94 9.03 1.94 12 1.94 12s0 2.97.48 4.81a2.97 2.97 0 0 0 2.09 2.1c1.84.49 7.49.49 7.49.49s5.65 0 7.49-.49a2.97 2.97 0 0 0 2.09-2.1c.48-1.84.48-4.81.48-4.81s0-2.97-.48-4.81ZM10.03 15.6V8.4L16.14 12l-6.11 3.6Z"/></svg>';
  }

  function youtubeUrl(song){
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(`ആത്മീയ ഗീതങ്ങൾ ${song.title || `ഗീതം ${song.num}`}`)}`;
  }

  function highlight(value, query){
    const text = String(value ?? '');
    const q = String(query || '').trim();
    if(!q) return escapeHtml(text);
    const lower = text.toLocaleLowerCase('ml');
    const target = q.toLocaleLowerCase('ml');
    const out = [];
    let pos = 0;
    let idx = lower.indexOf(target);
    while(idx >= 0){
      out.push(escapeHtml(text.slice(pos,idx)));
      out.push(`<mark class="search-hit">${escapeHtml(text.slice(idx,idx+target.length))}</mark>`);
      pos = idx + target.length;
      idx = lower.indexOf(target,pos);
    }
    if(pos === 0) return escapeHtml(text);
    out.push(escapeHtml(text.slice(pos)));
    return out.join('');
  }

  function formatLyrics(text, query=''){
    const clean = cleanLyrics(text);
    if(!clean) return '<p class="lyric-empty">വരികൾ ലഭ്യമല്ല.</p>';
    return clean.split(/\n[ \t]*\n/).filter(Boolean).map(block => {
      const lines = block.split('\n').filter(line => line.trim());
      return `<div class="lyric-stanza">${lines.map(line => {
        const m = line.match(/^\s*(\d{1,3})\s+(.*)$/);
        if(m) return `<div class="stanza-line"><span class="stanza-num">${m[1]}.</span><span>${highlight(m[2],query)}</span></div>`;
        return `<div class="lyric-line">${highlight(line,query)}</div>`;
      }).join('')}</div>`;
    }).join('');
  }

  function stanzaCount(song){
    return (cleanLyrics(song.lyrics).match(/(^|\n)\s*\d{1,3}\s+/g) || []).length;
  }

  function songCard(song, i){
    const stanza = stanzaCount(song);
    return `<article class="song-block" id="song-${song.num}" data-song-number="${song.num}">
      <div class="song-sheen" aria-hidden="true"></div>
      <header class="song-top">
        <div class="song-meta"><span class="meta-rule"></span><span>ഗീതം <strong>${song.num}</strong></span></div>
        <div class="song-actions">
          <button class="card-action" data-share="${song.num}" type="button" aria-label="Share song ${song.num}" title="Share">${icon('share')}</button>
          <button class="card-action" data-download="${song.num}" type="button" aria-label="Download song ${song.num} as image" title="Download image">${icon('download')}</button>
          <button class="card-action" data-reader="${song.num}" type="button" aria-label="Read song ${song.num}" title="Reading mode">${icon('read')}</button>
          <a class="youtube-btn" href="${youtubeUrl(song)}" target="_blank" rel="noopener noreferrer" aria-label="Search ${escapeHtml(song.title)} on YouTube"><span>${youtubeIcon()}</span><em>YouTube</em></a>
        </div>
      </header>
      <h2 class="song-title">${highlight(song.title,state.query)}</h2>
      <div class="song-lyrics">${formatLyrics(song.lyrics,state.query)}</div>
      <footer class="song-foot"><span>${stanza ? `${stanza} ${stanza===1?'stanza':'stanzas'}` : 'Lyrics'}</span><div class="song-foot-actions"><button data-copy="${song.num}" type="button">Copy</button><button data-reader="${song.num}" type="button">Read</button></div></footer>
    </article>`;
  }

  function searchableText(song){
    return normalize([song.num,`ഗീതം ${song.num}`,`song ${song.num}`,song.title,song.lyrics,...song.tags].join(' '));
  }

  // Convert common number forms into one exact numeric token.
  // Examples: "1", "Number 1", "Song 1", "ഗീതം 1", "#song-1".
  function normalizeSearchQuery(query){
    return normalize(query)
      .replace(/^#?song[-\s]?/i, '')
      .replace(/^(?:number|no\.?|ഗീതം)\s*/i, '')
      .trim();
  }

  // Requested compatibility alias: the book's "അകാരാദി" index label opens song 41.
  const SEARCH_ALIASES = new Map([
    ['അകാരാദി', 41]
  ]);

  function parseSongNumber(query){
    const clean = normalizeSearchQuery(query);
    if(/^\d+$/.test(clean)){
      const n = Number(clean);
      return Number.isSafeInteger(n) && n >= 1 ? n : null;
    }
    return null;
  }

  function matches(song,q){
    const n = normalize(q);
    if(!n) return true;
    const number = parseSongNumber(q);
    if(number !== null) return song.num === number;
    if(SEARCH_ALIASES.has(n)) return song.num === SEARCH_ALIASES.get(n);
    return searchableText(song).includes(n);
  }

  function filteredSongs(){ return SONGS.filter(song => matches(song,state.query)); }
  function getSong(number){ return SONG_MAP.get(Number(number)) || null; }

  function updateCounts(){
    const count = SONGS.length;
    $('collection-count').textContent = count;
    $('index-total').textContent = INDEX_TOTAL;
    $('about-count').textContent = count;
    $('about-index-count').textContent = INDEX_TOTAL;
    $('available-count').textContent = count;
    $('footer-count').textContent = `${count} / ${INDEX_TOTAL}`;
    $('result-count').textContent = `${filteredSongs().length} / ${count} songs`;
  }

  function renderFeed(){
    const list = filteredSongs();
    feed.innerHTML = list.map(songCard).join('');
    $('result-count').textContent = `${list.length} / ${SONGS.length} songs`;
    $('empty-state').hidden = list.length !== 0;
  }

  function setView(view){
    if(view === 'index'){
      openIndex();
      return;
    }
    closeIndex();
    closeSettings();
    state.view = view;
    document.querySelectorAll('.view').forEach(v => {
      const active = v.id === `${view}-view`;
      v.hidden = !active;
      v.classList.toggle('active',active);
    });
    document.querySelectorAll('[data-view]').forEach(btn => btn.classList.toggle('active',btn.dataset.view === view));
    if(view === 'home') window.scrollTo({top:0,behavior:prefersReducedMotion?'auto':'smooth'});
  }

  function openIndex(){
    closeSettings();
    $('available-count').textContent = SONGS.length;
    sheet.classList.add('open');
    overlay.classList.add('show');
    sheet.setAttribute('aria-hidden','false');
    document.body.classList.add('index-open');
    renderAkaradi(state.indexQuery);
    renderJumpGrid(state.indexQuery);
    showTab(state.activeTab);
    setTimeout(()=>menuSearch.focus({preventScroll:true}),prefersReducedMotion?0:160);
  }

  function closeIndex(){
    sheet.classList.remove('open');
    overlay.classList.remove('show');
    sheet.setAttribute('aria-hidden','true');
    document.body.classList.remove('index-open');
  }

  function showTab(tab){
    $('numbers-panel').classList.toggle('active',tab==='numbers');
    $('akaradi-panel').classList.toggle('active',tab==='akaradi');
    document.querySelectorAll('.menu-tab').forEach(btn => btn.classList.toggle('active',btn.dataset.tab===tab));
  }

  function renderJumpGrid(query=''){
    const q = normalize(query);
    const hasDigits = /^\d+$/.test(q);
    let numbers;

    if(hasDigits){
      // A numeric query is always an exact index lookup.
      const n=Number(q);
      numbers=(Number.isSafeInteger(n) && n>=1 && n<=INDEX_TOTAL) ? [n] : [];
    }else if(q){
      numbers=[...new Set(SONGS
        .filter(song => normalize(song.title).includes(q) || searchableText(song).includes(q))
        .map(song => song.num))];
    }else{
      // One continuous index: every number from 1 through the configured total.
      numbers=Array.from({length:INDEX_TOTAL},(_,i)=>i+1);
    }

    const available = AVAILABLE_NUMBERS;
    const titles = SONG_TITLES;
    const frag = document.createDocumentFragment();
    $('jump-grid').replaceChildren();
    for(const n of numbers){
      const button = document.createElement('button');
      button.type='button';
      button.dataset.indexSongTarget=n;
      button.textContent=n;
      if(available.has(n)){
        button.className='available';
        button.title=titles.get(n) || `Song ${n}`;
        button.setAttribute('aria-label',`Open song ${n}: ${titles.get(n) || ''}`.trim());
      }else{
        button.className='unavailable';
        button.disabled=true;
        button.title='Song not added yet';
        button.setAttribute('aria-label',`Song ${n} not added`);
      }
      frag.appendChild(button);
    }
    $('jump-grid').appendChild(frag);
    if(!$('jump-grid').children.length) $('jump-grid').innerHTML='<p class="menu-empty">No matching song</p>';
  }

  function firstChar(title){ return Array.from(String(title||'').trim())[0] || '•'; }
  function collator(){ try{return new Intl.Collator('ml',{numeric:true,sensitivity:'base'});}catch(_){return new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});} }

  const AKARADI_ENTRIES = (()=>{
    const c=collator();
    return SONGS.filter(song=>song.title).map(song=>({num:song.num,title:song.title,initial:firstChar(song.title)})).sort((a,b)=>c.compare(a.title,b.title));
  })();

  function getAkaradiEntries(){ return AKARADI_ENTRIES; }

  function renderAkaradi(query=''){
    const q = normalize(query);
    const list = getAkaradiEntries().filter(x => !q || normalize(x.title).includes(q) || String(x.num)===q);
    const initials = [...new Set(list.map(x=>x.initial))];
    $('akaradi-letters').innerHTML = initials.map(x=>`<button type="button" data-letter="${escapeHtml(x)}">${escapeHtml(x)}</button>`).join('');
    $('akaradi-list').innerHTML = list.length ? list.map(x => `<button type="button" data-num="${x.num}" data-song-target="${x.num}"><span class="a-num">${x.num}</span><span class="a-title">${escapeHtml(x.title)}</span><span class="a-arrow">${icon('arrow')}</span></button>`).join('') : '<p class="menu-empty">No results found</p>';
  }

  function navigateHash(number, push=true){
    const n = Number(number);
    const hash = `#song-${n}`;
    if(location.hash.toLowerCase() === hash.toLowerCase()) return;
    try{
      if(push) history.pushState({song:n},'',hash);
      else history.replaceState({song:n},'',hash);
    }catch(_){ location.hash=hash; }
  }

  function activateHomeView(){
    closeIndex();
    closeSettings();
    state.view='home';
    document.querySelectorAll('.view').forEach(v=>{
      const active = v.id==='home-view';
      v.hidden=!active;
      v.classList.toggle('active',active);
      // Never let the view entrance transform affect song positioning during
      // direct navigation.
      if(active) v.classList.add('navigation-stable');
      else v.classList.remove('navigation-stable');
    });
    document.querySelectorAll('[data-view]').forEach(btn=>btn.classList.toggle('active',btn.dataset.view==='home'));
  }

  async function waitForLayout(){
    await new Promise(resolve=>requestAnimationFrame(resolve));
    await new Promise(resolve=>requestAnimationFrame(resolve));
    try{ if(document.fonts?.ready) await document.fonts.ready; }catch(_){}
    await new Promise(resolve=>requestAnimationFrame(resolve));
  }

  function scrollToSongCard(card, options={}){
    if(!card) return;

    // IMPORTANT: navigation must use the card's real document position.
    // content-visibility/intrinsic-size and delayed scroll corrections can
    // otherwise make a jump briefly land on one song and then move to another.
    card.classList.add('song-navigation-target','focus-song');
    void card.offsetHeight;

    const header=$('site-header');
    const headerHeight=header ? header.getBoundingClientRect().height : 0;
    const targetY=Math.max(0, window.scrollY + card.getBoundingClientRect().top - headerHeight - 12);
    window.scrollTo({
      top: targetY,
      behavior: options.instant || prefersReducedMotion ? 'auto' : 'smooth'
    });

    card.setAttribute('tabindex','-1');
    try{card.focus({preventScroll:true});}catch(_){}

    // No delayed positional correction: a previous navigation must never be
    // allowed to alter the position chosen by the current navigation.
    const tokenAtFocus=activeNavigationNumber;
    setTimeout(()=>{
      if(activeNavigationNumber===tokenAtFocus){
        card.classList.remove('focus-song','song-navigation-target');
        card.removeAttribute('tabindex');
      }
    },prefersReducedMotion?700:2600);
  }

  async function jumpToSong(number, options={}){
    // Every navigation gets a token. If a delayed search/hash callback fires
    // after a newer navigation, it is ignored instead of moving the user.
    const token = ++navigationToken;
    clearTimeout(searchTimer);
    searchTimer=0;
    const song = getSong(number);
    if(!song){ showToast(`ഗീതം ${number} ചേർത്തിട്ടില്ല`); return false; }

    closeReader();
    activateHomeView();

    state.query='';
    state.suggestionIndex=-1;
    state.indexQuery='';
    menuSearch.value='';
    search.value='';
    clearSearch.hidden=true;
    $('search-suggestions').hidden=true;
    activeNavigationNumber = song.num;
    renderFeed();
    feed.classList.add('navigation-active');
    // Force the complete song list to participate in layout before measuring.
    // This prevents virtualized/intrinsic card heights from shifting the target.
    void feed.offsetHeight;

    if(options.updateHash !== false) navigateHash(song.num, options.replace ? false : true);

    await waitForLayout();
    if(token !== navigationToken || activeNavigationNumber !== song.num) return false;
    const card = $(`song-${song.num}`);
    if(!card){ showToast(`ഗീതം ${song.num} കണ്ടെത്താനായില്ല`); return false; }

    scrollToSongCard(card,options);
    setTimeout(()=>{
      if(token === navigationToken && activeNavigationNumber === song.num){
        feed.classList.remove('navigation-active');
      }
    }, prefersReducedMotion ? 500 : 2200);
    return true;
  }

  function openSongFromHash(){
    const rawHash = decodeURIComponent(location.hash || '');
    const match = rawHash.match(/^#(?:song-|song\/)(\d+)$/i);
    if(!match) return;
    const number = Number(match[1]);
    if(!getSong(number)) return;
    if(activeNavigationNumber === number){
      return;
    }

    // Use the same single navigation engine as Index/Search, but never write
    // another history entry while responding to an existing URL hash.
    jumpToSong(number,{updateHash:false,instant:true}).catch(()=>{});
  }

  function resolveExactSong(query){
    const n = normalize(query);
    if(!n) return null;

    const number = parseSongNumber(query);
    if(number !== null) return getSong(number);

    const aliasNumber = SEARCH_ALIASES.get(n);
    if(aliasNumber) return getSong(aliasNumber);

    const exact = SONGS.find(song => normalize(song.title) === n);
    return exact || null;
  }

  function rankedSearchResults(query){
    const n = normalize(query);
    const clean = normalizeSearchQuery(query);
    if(!clean) return [];

    // Numbers and explicit aliases are always one-result, deterministic lookups.
    const exactNumber = parseSongNumber(query);
    if(exactNumber !== null){
      const song = getSong(exactNumber);
      return song ? [song] : [];
    }
    const aliasNumber = SEARCH_ALIASES.get(n);
    if(aliasNumber){
      const song = getSong(aliasNumber);
      return song ? [song] : [];
    }

    // Prefer exact title, then title prefix, then title substring, then lyric matches.
    const exactSong = SONGS.find(song => normalize(song.title) === n);
    if(exactSong) return [exactSong];

    const titleStarts = SONGS.filter(song => normalize(song.title).startsWith(clean));
    const titleIncludes = SONGS.filter(song => normalize(song.title).includes(clean));
    const broad = SONGS.filter(song => matches(song,query));
    const seen = new Set();
    const out = [];
    for(const group of [titleStarts,titleIncludes,broad]){
      for(const song of group){
        if(!seen.has(song.num)){
          seen.add(song.num);
          out.push(song);
        }
      }
    }
    return out;
  }

  function runSearch(value){
    clearTimeout(searchTimer);
    state.suggestionIndex=-1;
    const requestedValue=String(value ?? '');
    searchTimer = setTimeout(()=>{
      searchTimer=0;
      // Do not let an older keystroke repaint the library after the user has
      // already navigated to an exact song.
      if(search.value !== requestedValue) return;
      state.query = requestedValue;
      renderFeed();
      renderSuggestions(requestedValue);
    },110);
  }

  function updateSuggestionSelection(){
    const buttons=[...document.querySelectorAll('#search-suggestions [data-suggest]')];
    buttons.forEach((button,i)=>{
      button.classList.toggle('suggestion-active',i===state.suggestionIndex);
      button.setAttribute('aria-selected',i===state.suggestionIndex?'true':'false');
    });
  }

  function renderSuggestions(q){
    const box = $('search-suggestions');
    const n = normalize(q);
    state.suggestionIndex=-1;
    if(!n){box.hidden=true;return;}
    const results = rankedSearchResults(q).slice(0,7);
    box.innerHTML = results.length
      ? results.map((song,i)=>`<button type="button" role="option" aria-selected="false" data-suggest="${song.num}" data-song-target="${song.num}" id="search-result-${song.num}-${i}"><span>${song.num}</span><strong>${escapeHtml(song.title)}</strong>${icon('arrow')}</button>`).join('')
      : '<p class="menu-empty">No matching song</p>';
    box.hidden=false;
    box.setAttribute('role','listbox');
  }

  async function submitSearch(){
    const q = search.value.trim();
    if(!q) return;

    // Highest-priority path: exact number, exact alias, exact title.
    const exact = resolveExactSong(q);
    if(exact){
      await jumpToSong(exact.num);
      return;
    }

    const suggestions=[...document.querySelectorAll('#search-suggestions [data-suggest]')];
    if(state.suggestionIndex>=0 && suggestions[state.suggestionIndex]){
      await jumpToSong(Number(suggestions[state.suggestionIndex].dataset.suggest));
      return;
    }

    const results = rankedSearchResults(q);
    if(results.length===1){
      await jumpToSong(results[0].num);
      return;
    }
    if(results.length){
      const clean=normalizeSearchQuery(q);
      const prefix=results.filter(song=>normalize(song.title).startsWith(clean));
      if(prefix.length===1){
        await jumpToSong(prefix[0].num);
        return;
      }
      renderSuggestions(q);
      const first=$('#search-suggestions [data-suggest]');
      if(first){first.classList.add('suggestion-active');state.suggestionIndex=0;}
      showToast(`${results.length} matching songs — choose a result`);
      return;
    }
    showToast('No matching song');
  }

  function focusSearch(){
    setView('home');
    setTimeout(()=>{search.focus({preventScroll:true});search.select();},40);
  }

  function openReader(number){
    const song = getSong(number);
    if(!song) return;
    state.currentSong=song.num;
    $('reader-number').textContent=`ഗീതം ${song.num}`;
    $('reader-title').textContent=song.title;
    $('reader-content').innerHTML=formatLyrics(song.lyrics,'');
    readerOverlay.classList.add('open');
    readerOverlay.setAttribute('aria-hidden','false');
    document.body.classList.add('reader-open');
    $('reader-content').scrollTop=0;
    stopAutoScroll();
    updateReaderNav();
    navigateHash(song.num, true);
  }

  function closeReader(){
    stopAutoScroll();
    readerOverlay.classList.remove('open');
    readerOverlay.setAttribute('aria-hidden','true');
    document.body.classList.remove('reader-open');
  }

  function updateReaderNav(){
    const idx=SONGS.findIndex(song=>song.num===state.currentSong);
    $('reader-prev').disabled=idx<=0;
    $('reader-next').disabled=idx<0||idx===SONGS.length-1;
  }

  function readerMove(delta){
    const idx=SONGS.findIndex(song=>song.num===state.currentSong);
    const next=SONGS[idx+delta];
    if(next) openReader(next.num);
  }

  function stopAutoScroll(){
    state.autoScrolling=false;
    clearInterval(autoTimer);
    autoTimer=0;
    $('reader-auto').classList.remove('active');
  }

  function startAutoScroll(){
    if(state.autoScrolling)return;
    state.autoScrolling=true;
    $('reader-auto').classList.add('active');
    const step=state.autoSpeed*.34;
    autoTimer=setInterval(()=>{
      const box=$('reader-content');
      if(!readerOverlay.classList.contains('open')) return stopAutoScroll();
      box.scrollTop+=step;
      if(box.scrollTop+box.clientHeight>=box.scrollHeight-2) stopAutoScroll();
    },20);
  }

  function toggleAutoScroll(){ state.autoScrolling ? stopAutoScroll() : startAutoScroll(); }

  async function shareSong(number){
    const song=getSong(number);
    if(!song)return;
    const url=new URL(location.href);
    url.hash=`song-${song.num}`;
    const data={title:`ഗീതം ${song.num} · ${song.title}`,text:`${song.title} — Athmeeya Geethangal`,url:url.toString()};
    if(navigator.share){
      try{await navigator.share(data);return;}catch(err){if(err?.name==='AbortError')return;}
    }
    try{await navigator.clipboard.writeText(url.toString());showToast('Song link copied');}
    catch(_){showToast(url.toString());}
  }

  async function copyLyrics(number){
    const song=getSong(number);
    if(!song)return;
    try{await navigator.clipboard.writeText(cleanLyrics(song.lyrics));showToast('Lyrics copied');}
    catch(_){showToast('Copy is not available here');}
  }

  function clampScale(value){return Math.min(READER_MAX,Math.max(READER_MIN,Number(value)||1));}
  function applyScale(){
    root.style.setProperty('--reader-scale',state.readerScale.toFixed(2));
    $('zoom-out').disabled=state.readerScale<=READER_MIN+.001;
    $('zoom-in').disabled=state.readerScale>=READER_MAX-.001;
    $('size-indicator').style.width=`${((state.readerScale-READER_MIN)/(READER_MAX-READER_MIN))*100}%`;
  }

  function loadPreferences(){
    try{
      state.readerScale=clampScale(Number(localStorage.getItem(STORAGE.scale))||1);
      state.autoSpeed=Number(localStorage.getItem(STORAGE.speed))||.8;
    }catch(_){ }
    applyScale();
  }

  function setScale(delta){
    const next=clampScale(Math.round((state.readerScale+delta)/READER_STEP)*READER_STEP);
    if(next===state.readerScale)return;
    state.readerScale=next;
    applyScale();
    try{localStorage.setItem(STORAGE.scale,state.readerScale);}catch(_){ }
  }

  function openSettings(){settingsSheet.classList.add('open');settingsSheet.setAttribute('aria-hidden','false');settingsBackdrop.classList.add('show');}
  function closeSettings(){settingsSheet.classList.remove('open');settingsSheet.setAttribute('aria-hidden','true');settingsBackdrop.classList.remove('show');}
  function resetPreferences(){
    try{localStorage.removeItem(STORAGE.scale);localStorage.removeItem(STORAGE.speed);}catch(_){ }
    state.readerScale=1;state.autoSpeed=.8;loadPreferences();
    document.querySelectorAll('#reader-speed button').forEach(btn=>btn.classList.toggle('active',Number(btn.dataset.speed)===state.autoSpeed));
    showToast('Reading preferences reset');
  }

  function updateNetwork(){
    const online=navigator.onLine;
    $('network-label').textContent=online?'Online':'Offline';
    document.body.classList.toggle('offline',!online);
    $('offline-title').textContent=online?'Offline ready':'Offline mode';
    $('offline-copy').textContent=online?'The app can cache the current library for use without a connection.':'You are offline. Cached songs remain available.';
  }

  function fitText(ctx,text,maxWidth){
    const words=String(text||'').split(/\s+/).filter(Boolean);
    if(!words.length)return [''];
    const lines=[];let line=words[0];
    for(let i=1;i<words.length;i++){
      const test=`${line} ${words[i]}`;
      if(ctx.measureText(test).width<=maxWidth) line=test;
      else{lines.push(line);line=words[i];}
    }
    lines.push(line);return lines;
  }

  function roundRect(ctx,x,y,w,h,r){
    const rr=Math.min(r,w/2,h/2);
    ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath();
  }

  function loadImage(src){
    return new Promise((resolve,reject)=>{
      const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;
    });
  }

  async function createSongImageBlob(song){
    const width=1600;
    const padding=120;
    const contentWidth=width-padding*2;
    const baseLines=[];
    const clean=cleanLyrics(song.lyrics);
    const blocks=clean.split(/\n[ \t]*\n/).filter(Boolean);
    const measure=document.createElement('canvas').getContext('2d');
    if(document.fonts?.ready) await document.fonts.ready;
    measure.font='500 32px "Noto Sans Malayalam", "Nirmala UI", sans-serif';
    for(const block of blocks){
      baseLines.push({type:'space'});
      for(const raw of block.split('\n').filter(line=>line.trim())){
        const m=raw.match(/^\s*(\d{1,3})\s+(.*)$/);
        const prefix=m?`${m[1]}. `:'';
        const text=m?m[2]:raw;
        const wrapped=fitText(measure,text,contentWidth-90);
        baseLines.push({type:m?'stanza':'line',prefix,lines:wrapped});
      }
    }
    const lineHeight=52;
    const top=240;
    const titleLines=fitText((measure.font='700 54px "Noto Serif Malayalam", Georgia, serif',measure),song.title,contentWidth-80).length;
    const height=Math.max(1100,Math.min(7200,top+titleLines*72+120+baseLines.reduce((sum,item)=>sum+(item.type==='space'?30:item.lines.length*lineHeight),0)+170));

    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');
    try{
      const bg=await loadImage('download-bg.jpg');
      ctx.drawImage(bg,0,0,width,height);
    }catch(_){
      const grad=ctx.createLinearGradient(0,0,width,height);grad.addColorStop(0,'#f6ead9');grad.addColorStop(.55,'#e8dac5');grad.addColorStop(1,'#cbb192');ctx.fillStyle=grad;ctx.fillRect(0,0,width,height);
    }
    ctx.fillStyle='rgba(245,235,218,.74)';ctx.fillRect(0,0,width,height);
    const vignette=ctx.createRadialGradient(width*.45,height*.25,80,width*.50,height*.55,width*.75);vignette.addColorStop(0,'rgba(255,250,242,.12)');vignette.addColorStop(1,'rgba(82,48,28,.24)');ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);

    const cardX=90,cardY=80,cardW=width-180;
    ctx.fillStyle='rgba(255,249,239,.92)';roundRect(ctx,cardX,cardY,cardW,height-160,42);ctx.fill();
    ctx.strokeStyle='rgba(91,63,40,.18)';ctx.lineWidth=2;roundRect(ctx,cardX,cardY,cardW,height-160,42);ctx.stroke();

    try{const logo=await loadImage('logo.svg');ctx.drawImage(logo,width/2-55,125,110,118);}catch(_){ }
    ctx.textAlign='center';ctx.fillStyle='#6a2631';ctx.font='700 28px "DM Sans", sans-serif';ctx.fillText('ATHMEEYA GEETHANGAL',width/2,290);
    ctx.fillStyle='#ab8048';ctx.font='700 22px "DM Sans", sans-serif';ctx.fillText(`ഗീതം ${song.num}`,width/2,333);
    ctx.fillStyle='#352b26';ctx.font='700 54px "Noto Serif Malayalam", Georgia, serif';
    const titleWrapped=fitText(ctx,song.title,contentWidth-80);
    titleWrapped.forEach((line,i)=>ctx.fillText(line,width/2,410+i*72));
    ctx.strokeStyle='rgba(171,128,72,.5)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(width/2-130,450+titleWrapped.length*72);ctx.lineTo(width/2+130,450+titleWrapped.length*72);ctx.stroke();

    let y=535+titleWrapped.length*72;
    ctx.textAlign='left';ctx.font='500 32px "Noto Sans Malayalam", "Nirmala UI", sans-serif';
    for(const item of baseLines){
      if(item.type==='space'){y+=18;continue;}
      for(let i=0;i<item.lines.length;i++){
        const text=`${item.prefix}${item.lines[i]}`;
        ctx.fillStyle=item.type==='stanza'&&i===0?'#6a2631':'#574e45';
        ctx.fillText(text,padding,y);
        y+=lineHeight;
      }
    }
    ctx.textAlign='center';ctx.fillStyle='#ab8048';ctx.font='600 20px "DM Sans", sans-serif';ctx.fillText('1 കൊരിന്ത്യർ 14:15',width/2,height-92);
    ctx.fillStyle='#7f7469';ctx.font='600 16px "DM Sans", sans-serif';ctx.fillText('Athmeeya Geethangal · LHMM',width/2,height-58);

    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Unable to create image')),'image/png',.94));
  }

  async function downloadSongImage(number){
    const song=getSong(number);
    if(!song)return;
    showToast('Preparing song image…');
    try{
      const blob=await createSongImageBlob(song);
      const file=new File([blob],`athmeeya-geetham-${song.num}.png`,{type:'image/png'});
      if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
        try{await navigator.share({title:`ഗീതം ${song.num} · ${song.title}`,files:[file]});return;}catch(err){if(err?.name==='AbortError')return;}
      }
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),2000);
      showToast('Song image saved');
    }catch(err){
      showToast('Could not create the song image');
      console.error(err);
    }
  }

  function handleClick(event){
    const indexSong=event.target.closest('[data-index-song-target]');
    if(indexSong && !indexSong.disabled){
      event.preventDefault();
      event.stopPropagation();
      jumpToSong(Number(indexSong.dataset.indexSongTarget));
      return;
    }

    const akaradiSong=event.target.closest('#akaradi-list [data-song-target]');
    if(akaradiSong){
      event.preventDefault();
      event.stopPropagation();
      jumpToSong(Number(akaradiSong.dataset.songTarget));
      return;
    }

    const view=event.target.closest('[data-view]');if(view){setView(view.dataset.view);return;}
    const suggest=event.target.closest('[data-suggest]');if(suggest){
      event.preventDefault();
      event.stopPropagation();
      $('search-suggestions').hidden=true;
      void jumpToSong(Number(suggest.dataset.suggest));
      return;
    }
    const share=event.target.closest('[data-share]');if(share){shareSong(Number(share.dataset.share));return;}
    const download=event.target.closest('[data-download]');if(download){downloadSongImage(Number(download.dataset.download));return;}
    const copy=event.target.closest('[data-copy]');if(copy){copyLyrics(Number(copy.dataset.copy));return;}
    const reader=event.target.closest('[data-reader]');if(reader){openReader(Number(reader.dataset.reader));return;}
    const tab=event.target.closest('[data-tab]');if(tab){state.activeTab=tab.dataset.tab;showTab(state.activeTab);return;}
    const letter=event.target.closest('[data-letter]');if(letter){const el=[...document.querySelectorAll('#akaradi-list [data-num]')].find(btn=>btn.querySelector('.a-title')?.textContent?.trim()?.startsWith(letter.dataset.letter));el?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  }

  search.addEventListener('input',()=>{clearSearch.hidden=!search.value;runSearch(search.value);});
  search.addEventListener('keydown',event=>{
    const suggestionButtons=[...document.querySelectorAll('#search-suggestions [data-suggest]')];
    if(event.key==='ArrowDown' && suggestionButtons.length){
      event.preventDefault();
      state.suggestionIndex=(state.suggestionIndex+1)%suggestionButtons.length;
      updateSuggestionSelection();
      return;
    }
    if(event.key==='ArrowUp' && suggestionButtons.length){
      event.preventDefault();
      state.suggestionIndex=(state.suggestionIndex-1+suggestionButtons.length)%suggestionButtons.length;
      updateSuggestionSelection();
      return;
    }
    if(event.key==='Escape'){
      $('search-suggestions').hidden=true;
      state.suggestionIndex=-1;
      return;
    }
    if(event.key==='Enter'){event.preventDefault();submitSearch();}
  });
  clearSearch.addEventListener('click',()=>{search.value='';state.query='';clearSearch.hidden=true;$('search-suggestions').hidden=true;state.suggestionIndex=-1;renderFeed();search.focus();});
  menuSearch.addEventListener('input',()=>{state.indexQuery=menuSearch.value;renderAkaradi(state.indexQuery);renderJumpGrid(state.indexQuery);});
  menuSearch.addEventListener('keydown',async event=>{
    if(event.key==='Enter'){
      event.preventDefault();
      const q=menuSearch.value.trim();
      if(!q)return;
      const exact=resolveExactSong(q);
      if(exact){await jumpToSong(exact.num);return;}
      const results=rankedSearchResults(q);
      if(results.length===1){await jumpToSong(results[0].num);return;}
      if(results.length){
        const prefix=results.filter(song=>normalize(song.title).startsWith(normalizeSearchQuery(q)));
        if(prefix.length===1){await jumpToSong(prefix[0].num);return;}
        showToast(`${results.length} matching songs — tap one to open`);
      }else showToast('No matching song');
    }
  });
  $('close-index').addEventListener('click',closeIndex);overlay.addEventListener('click',closeIndex);
  $('open-index-home').addEventListener('click',openIndex);
  $('random-song').addEventListener('click',()=>{if(!SONGS.length)return;const song=SONGS[Math.floor(Math.random()*SONGS.length)];jumpToSong(song.num);});
  $('jump-song').addEventListener('click',()=>{
    const raw=prompt(`Enter a song number (1–${INDEX_TOTAL})`);
    if(raw===null)return;
    if(/^\s*\d+\s*$/.test(raw)){jumpToSong(Number(raw.trim()));return;}
    const exact=resolveExactSong(raw);if(exact)jumpToSong(exact.num);else showToast('Enter a song number or exact title');
  });
  $('mobile-search').addEventListener('click',focusSearch);
  $('open-settings').addEventListener('click',openSettings);
  $('close-settings').addEventListener('click',closeSettings);
  settingsBackdrop.addEventListener('click',closeSettings);
  $('zoom-out').addEventListener('click',()=>setScale(-READER_STEP));
  $('zoom-in').addEventListener('click',()=>setScale(READER_STEP));
  $('clear-preferences').addEventListener('click',resetPreferences);
  $('refresh-app').addEventListener('click',()=>location.reload());
  document.querySelectorAll('[data-open-install]').forEach(btn=>btn.addEventListener('click',()=>openInstallModal({auto:false})));
  $('install-now').addEventListener('click',startInstall);
  $('install-close').addEventListener('click',()=>closeInstallModal({remember:true}));
  document.querySelector('.install-backdrop')?.addEventListener('click',()=>closeInstallModal({remember:true}));
  $('reader-close').addEventListener('click',closeReader);
  $('reader-prev').addEventListener('click',()=>readerMove(-1));
  $('reader-next').addEventListener('click',()=>readerMove(1));
  $('reader-auto').addEventListener('click',toggleAutoScroll);
  $('reader-copy').addEventListener('click',()=>copyLyrics(state.currentSong));
  $('reader-download').addEventListener('click',()=>downloadSongImage(state.currentSong));
  $('reader-share').addEventListener('click',()=>shareSong(state.currentSong));
  $('reader-youtube').addEventListener('click',()=>{const song=getSong(state.currentSong);if(song)window.open(youtubeUrl(song),'_blank','noopener,noreferrer');});
  document.querySelectorAll('#reader-speed button').forEach(btn=>btn.addEventListener('click',()=>{
    state.autoSpeed=Number(btn.dataset.speed)||.8;
    try{localStorage.setItem(STORAGE.speed,state.autoSpeed);}catch(_){ }
    document.querySelectorAll('#reader-speed button').forEach(x=>x.classList.toggle('active',x===btn));
    if(state.autoScrolling){stopAutoScroll();startAutoScroll();}
  }));
  document.addEventListener('click',handleClick);
  document.addEventListener('click',event=>{if(!event.target.closest('.search-row'))$('search-suggestions').hidden=true;});

  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      if($('install-modal').classList.contains('open'))closeInstallModal();
      else if(readerOverlay.classList.contains('open'))closeReader();
      else if(sheet.classList.contains('open'))closeIndex();
      else if(settingsSheet.classList.contains('open'))closeSettings();
    }
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();focusSearch();return;}
    if(!readerOverlay.classList.contains('open')){
      if(event.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){event.preventDefault();focusSearch();}
      if(event.key.toLowerCase()==='r'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName))$('random-song').click();
    }else{
      if(event.key==='ArrowLeft')readerMove(-1);
      if(event.key==='ArrowRight')readerMove(1);
      if(event.code==='Space'){event.preventDefault();toggleAutoScroll();}
    }
  });

  window.addEventListener('popstate',()=>{if(readerOverlay.classList.contains('open'))closeReader();openSongFromHash();});
  window.addEventListener('hashchange',openSongFromHash);
  window.addEventListener('online',updateNetwork);
  window.addEventListener('offline',updateNetwork);
  window.addEventListener('scroll',()=>{
    $('top-btn').classList.toggle('show',scrollY>480);
    const d=document.documentElement,max=d.scrollHeight-d.clientHeight;
    $('scroll-progress').style.width=`${max>0?Math.min(100,scrollY/max*100):0}%`;
  },{passive:true});
  $('top-btn').addEventListener('click',()=>window.scrollTo({top:0,behavior:prefersReducedMotion?'auto':'smooth'}));

  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredInstallPrompt=event;
    updateInstallAvailability();
  });

  window.addEventListener('appinstalled',()=>{markInstallPromptSeen();finishInstallSuccess();});

  function autoShowInstallPrompt(){
    if(isStandalone() || hasSeenInstallPrompt()) return;
    if(document.visibilityState!=='visible') return;
    setTimeout(()=>{
      const modal=$('install-modal');
      if(!modal || isStandalone() || hasSeenInstallPrompt() || document.visibilityState!=='visible' || modal.classList.contains('open')) return;
      openInstallModal({auto:true});
    }, 1200);
  }

  function registerSW(){
    if(!('serviceWorker' in navigator))return;
    window.addEventListener('load',async()=>{
      try{
        const registration=await navigator.serviceWorker.register('./service-worker.js',{updateViaCache:'none'});
        await registration.update();
        window.addEventListener('online',()=>registration.update().catch(()=>{}));
        document.addEventListener('visibilitychange',()=>{
          if(document.visibilityState==='visible') registration.update().catch(()=>{});
        });
      }catch(_){ }
    });
  }

  function init(){
    loadPreferences();
    updateNetwork();
    updateCounts();
    renderFeed();
    renderJumpGrid();
    renderAkaradi();
    state.view='home';
    setView('home');
    openSongFromHash();
    requestAnimationFrame(()=>document.body.classList.add('page-ready'));
    autoShowInstallPrompt();
    const scheduleSW = window.requestIdleCallback || ((cb)=>setTimeout(cb,1200));
    scheduleSW(()=>registerSW(), {timeout:2000});
  }

  init();
})();

