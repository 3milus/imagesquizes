// Multiplayer logic — depends on globals from app.js: $, showScreen, loadJSON, shuffle
// Uses Firebase Realtime Database + Anonymous Auth (compat SDK loaded in index.html).

// ── State ──────────────────────────────────────────────────────────────────
let mpDb        = null;
let mpUid       = null;   // Firebase anonymous auth UID
let mpRoom      = null;   // current room code
let mpIsHost    = false;
let mpRoomRef   = null;   // Firebase ref — kept for cleanup
let mpQuizData  = null;   // quiz.json loaded for this session
let mpSetupMode = 'create'; // 'create' | 'join'
let mpHasPlayed = false;  // prevents re-triggering startMpQuiz on every Firebase update

// ── Init ───────────────────────────────────────────────────────────────────
async function mpInit() {
  // Bail out silently if firebase-config.js has not been filled in
  if (
    typeof FIREBASE_CONFIG === 'undefined' ||
    !FIREBASE_CONFIG.databaseURL ||
    FIREBASE_CONFIG.databaseURL.includes('YOUR_')
  ) {
    hideMpSection();
    return;
  }

  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    mpDb = firebase.database();
    const cred = await firebase.auth().signInAnonymously();
    mpUid = cred.user.uid;
  } catch (e) {
    console.warn('Firebase init failed:', e);
    hideMpSection();
    return;
  }

  wireMpListeners();
}

function hideMpSection() {
  const el = $('mp-home-section');
  if (el) el.hidden = true;
}

// ── Event wiring ───────────────────────────────────────────────────────────
function wireMpListeners() {
  // Home
  $('btn-create-room').addEventListener('click', () => openSetup('create'));
  $('btn-home-join').addEventListener('click', () => {
    openSetup('join', $('input-home-code').value.trim());
  });
  $('input-home-code').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('btn-home-join').click();
  });
  $('input-home-code').addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  // Setup screen
  $('btn-setup-back').addEventListener('click', () => showScreen('home'));
  $('btn-setup-confirm').addEventListener('click', handleSetupConfirm);
  $('input-player-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSetupConfirm();
  });
  $('input-join-code').addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  // Lobby
  $('btn-lobby-leave').addEventListener('click', confirmLeave);
  $('btn-start-game').addEventListener('click', hostStartGame);
  $('btn-copy-code').addEventListener('click', copyCode);

  // Group results
  $('btn-play-again-mp').addEventListener('click', playAgainMp);
  $('btn-leave-room').addEventListener('click', confirmLeave);
}

// ── Setup screen ───────────────────────────────────────────────────────────
function openSetup(mode, prefill = '') {
  mpSetupMode = mode;
  const creating = mode === 'create';

  $('setup-title').textContent       = creating ? 'Create a Room' : 'Join a Room';
  $('setup-desc').textContent        = creating
    ? "Enter your name — you'll get a room code to share with friends."
    : 'Enter the room code and your name to join.';
  $('setup-code-field').hidden       = creating;
  $('btn-setup-confirm').textContent = creating ? 'Create Room →' : 'Join Room →';
  $('setup-error').hidden            = true;
  $('input-player-name').value       = '';
  $('input-join-code').value         = prefill.toUpperCase();

  showScreen('mp-setup');
  setTimeout(() => {
    (mode === 'join' && !prefill ? $('input-join-code') : $('input-player-name')).focus();
  }, 60);
}

async function handleSetupConfirm() {
  const name = $('input-player-name').value.trim();
  if (!name) { showSetupError('Please enter your name.'); return; }

  const btn = $('btn-setup-confirm');
  btn.disabled = true;
  $('setup-error').hidden = true;

  try {
    if (mpSetupMode === 'create') {
      await createRoom(name);
    } else {
      const code = $('input-join-code').value.trim().toUpperCase();
      if (code.length !== 5) { showSetupError('Room code must be 5 characters.'); return; }
      await joinRoom(code, name);
    }
  } catch (e) {
    showSetupError(e.message || 'Something went wrong — please try again.');
  } finally {
    btn.disabled = false;
  }
}

function showSetupError(msg) {
  const el = $('setup-error');
  el.textContent = msg;
  el.hidden = false;
}

// ── Room creation ──────────────────────────────────────────────────────────
async function createRoom(playerName) {
  const quizzesMeta = await loadJSON('quizzes.json');
  mpQuizData = await loadJSON(`quizzes/${quizzesMeta[0].id}/quiz.json`);

  // Find a free room code (retry up to 8 times)
  let code;
  for (let i = 0; i < 8; i++) {
    code = randomCode();
    const snap = await mpDb.ref(`rooms/${code}`).once('value');
    if (!snap.exists()) break;
  }

  mpRoom   = code;
  mpIsHost = true;

  await mpDb.ref(`rooms/${code}`).set({
    quizId:    mpQuizData.id,
    status:    'lobby',
    hostId:    mpUid,
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    players: {
      [mpUid]: playerRecord(playerName, true)
    }
  });

  // Auto-remove player flag on disconnect
  mpDb.ref(`rooms/${code}/players/${mpUid}/connected`).onDisconnect().set(false);

  enterLobby();
}

// ── Room joining ───────────────────────────────────────────────────────────
async function joinRoom(code, playerName) {
  const snap = await mpDb.ref(`rooms/${code}`).once('value');
  const room = snap.val();

  if (!room)                       throw new Error('Room not found — check the code.');
  if (room.status === 'playing')   throw new Error('This game has already started.');
  if (room.status === 'finished')  throw new Error('This game has already ended.');
  if (room.status === 'disbanded') throw new Error('This room no longer exists.');

  mpRoom   = code;
  mpIsHost = false;
  mpQuizData = await loadJSON(`quizzes/${room.quizId}/quiz.json`);

  await mpDb.ref(`rooms/${code}/players/${mpUid}`).set(playerRecord(playerName, false));
  mpDb.ref(`rooms/${code}/players/${mpUid}/connected`).onDisconnect().set(false);

  enterLobby();
}

function playerRecord(name, isHost) {
  return {
    name,
    isHost,
    connected: true,
    finished:  false,
    score:     null,
    answers:   null,
    joined:    firebase.database.ServerValue.TIMESTAMP
  };
}

// ── Lobby ──────────────────────────────────────────────────────────────────
function enterLobby() {
  mpHasPlayed = false;  // reset so the next round can start
  $('lobby-code').textContent     = mpRoom;
  $('lobby-quiz-name').textContent = mpQuizData.title;
  $('host-controls').hidden       = !mpIsHost;
  $('guest-waiting-msg').hidden   = mpIsHost;
  $('btn-start-game').disabled    = true;

  // Register the quiz-finish and back-button callbacks
  window.mpCallbacks = {
    onQuizFinished: handleQuizFinished,
    onExit:         confirmLeave
  };

  showScreen('lobby');
  attachRoomListener();
}

// ── Room listener — drives all state transitions ───────────────────────────
function attachRoomListener() {
  if (mpRoomRef) { mpRoomRef.off(); mpRoomRef = null; }

  mpRoomRef = mpDb.ref(`rooms/${mpRoom}`);
  mpRoomRef.on('value', snap => {
    const room = snap.val();
    if (!room) return;

    const players    = room.players || {};
    const activeId   = document.querySelector('.screen.active')?.id;

    // Always keep lobby player list fresh
    if (activeId === 'screen-lobby') {
      renderLobbyPlayers(players);
      if (mpIsHost) refreshStartButton(players);
    }

    // Keep waiting screen fresh
    if (activeId === 'screen-waiting') {
      renderWaitingPlayers(players);
      // Last connected player to finish triggers the room close-out
      checkAllFinished(players);
    }

    // ── Status-driven transitions ────────────────────────────────────────
    if (room.status === 'playing' && !mpHasPlayed) {
      mpHasPlayed = true;
      const ordered = room.itemOrder.map(i => mpQuizData.items[i]);
      window.startMpQuiz(mpQuizData, ordered);
    }

    if (room.status === 'finished' && activeId !== 'screen-group-results') {
      renderGroupResults(players);
    }

    // Play-again reset: status flips back to lobby while on results/waiting
    if (room.status === 'lobby' &&
        (activeId === 'screen-group-results' || activeId === 'screen-waiting')) {
      enterLobby();
    }

    if (room.status === 'disbanded' && activeId !== 'screen-home') {
      detach();
      alert('The host ended the room.');
      showScreen('home');
    }
  });
}

// ── Lobby helpers ──────────────────────────────────────────────────────────
function renderLobbyPlayers(players) {
  const entries = Object.entries(players)
    .sort(([, a], [, b]) => (a.joined || 0) - (b.joined || 0));

  $('lobby-player-count').textContent = entries.length;
  $('lobby-player-list').innerHTML = entries.map(([id, p]) => `
    <div class="lobby-player${id === mpUid ? ' is-you' : ''}">
      <span class="lp-icon">${p.isHost ? '👑' : '👤'}</span>
      <span class="lp-name">
        ${esc(p.name)}${id === mpUid ? ' <em class="you-tag">(you)</em>' : ''}
      </span>
      ${p.connected === false ? '<span class="lp-gone">disconnected</span>' : ''}
    </div>
  `).join('');
}

function refreshStartButton(players) {
  const n = Object.keys(players).length;
  $('btn-start-game').disabled = n < 2;
  $('lobby-hint').textContent  = n < 2
    ? 'Need at least 2 players to start.'
    : `${n} players ready — start when you like!`;
}

// ── Host: start the game ───────────────────────────────────────────────────
async function hostStartGame() {
  $('btn-start-game').disabled = true;
  const indices = mpQuizData.items.map((_, i) => i);
  await mpDb.ref(`rooms/${mpRoom}`).update({
    status:    'playing',
    itemOrder: shuffle([...indices])
  });
  // All clients' room listeners fire and call window.startMpQuiz()
}

// ── Quiz finish callback (called by app.js via window.mpCallbacks) ─────────
async function handleQuizFinished(finalScore, finalAnswers) {
  const ansArr = finalAnswers.map(a => a.correct ? 1 : 0);

  await mpDb.ref(`rooms/${mpRoom}/players/${mpUid}`).update({
    finished: true,
    score:    finalScore,
    answers:  ansArr
  });

  $('waiting-score').textContent = `${finalScore} / ${finalAnswers.length}`;
  showScreen('waiting');
  // Room listener will re-render the waiting list and eventually trigger group results
}

// ── Waiting screen ─────────────────────────────────────────────────────────
function renderWaitingPlayers(players) {
  const total   = mpQuizData.items.length;
  const entries = Object.entries(players)
    .sort(([, a], [, b]) => (b.score ?? -1) - (a.score ?? -1));

  $('waiting-player-list').innerHTML = entries.map(([id, p]) => `
    <div class="waiting-player">
      <span class="wp-name">${esc(p.name)}${id === mpUid ? ' <em class="you-tag">(you)</em>' : ''}</span>
      <span class="wp-status ${p.finished ? 'wp-done' : 'wp-going'}">
        ${p.finished ? `${p.score} / ${total}` : '…'}
      </span>
    </div>
  `).join('');
}

function checkAllFinished(players) {
  if (!mpIsHost) return;
  const connected = Object.values(players).filter(p => p.connected !== false);
  if (connected.length > 0 && connected.every(p => p.finished)) {
    mpDb.ref(`rooms/${mpRoom}/status`).set('finished');
  }
}

// ── Group results ──────────────────────────────────────────────────────────
function renderGroupResults(players) {
  const total  = mpQuizData.items.length;
  const medals = ['🥇', '🥈', '🥉'];

  const sorted = Object.entries(players)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  $('leaderboard').innerHTML = sorted.map((p, i) => {
    const isYou = p.id === mpUid;
    const dots  = Array.isArray(p.answers)
      ? p.answers.map(a => `<span class="dot ${a ? 'c' : 'w'}"></span>`).join('')
      : '<span class="dot-na">no data</span>';
    return `
      <div class="lb-row${isYou ? ' lb-you' : ''}">
        <span class="lb-rank">${medals[i] ?? `${i + 1}.`}</span>
        <div class="lb-info">
          <span class="lb-name">
            ${esc(p.name)}${isYou ? ' <em class="you-tag">(you)</em>' : ''}
          </span>
          <div class="lb-dots">${dots}</div>
        </div>
        <span class="lb-score">
          ${p.score ?? '?'}<span class="lb-total"> / ${total}</span>
        </span>
      </div>`;
  }).join('');

  $('btn-play-again-mp').hidden = !mpIsHost;
  showScreen('group-results');
}

// ── Play again ─────────────────────────────────────────────────────────────
async function playAgainMp() {
  if (!mpIsHost) { alert('Only the host can start a new round.'); return; }

  const snap    = await mpDb.ref(`rooms/${mpRoom}/players`).once('value');
  const updates = { status: 'lobby', itemOrder: null };

  Object.keys(snap.val() || {}).forEach(id => {
    updates[`players/${id}/finished`] = false;
    updates[`players/${id}/score`]    = null;
    updates[`players/${id}/answers`]  = null;
  });

  await mpDb.ref(`rooms/${mpRoom}`).update(updates);
  // Room listener picks up status: 'lobby' → enterLobby()
}

// ── Leave / cleanup ────────────────────────────────────────────────────────
function confirmLeave() {
  if (confirm('Leave the room?')) leaveRoom();
}

async function leaveRoom() {
  detach();

  if (mpRoom && mpUid && mpDb) {
    try { await mpDb.ref(`rooms/${mpRoom}/players/${mpUid}`).remove(); } catch {}
    if (mpIsHost) {
      try { await mpDb.ref(`rooms/${mpRoom}/status`).set('disbanded'); } catch {}
    }
  }

  mpRoom   = null;
  mpIsHost = false;
  window.mpCallbacks = null;
  showScreen('home');
}

function detach() {
  if (mpRoomRef) { mpRoomRef.off(); mpRoomRef = null; }
}

// ── Copy room code ─────────────────────────────────────────────────────────
function copyCode() {
  const code = $('lobby-code').textContent;
  const btn  = $('btn-copy-code');

  navigator.clipboard?.writeText(code).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  }).catch(() => {
    // Fallback: select the text visually
    const range = document.createRange();
    range.selectNode($('lobby-code'));
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ── Boot ───────────────────────────────────────────────────────────────────
mpInit();
