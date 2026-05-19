const $ = id => document.getElementById(id);

// ── State ──────────────────────────────────────────────────────────────────
let quiz     = null;   // loaded quiz.json data
let items    = [];     // shuffled items for this round
let idx      = 0;      // current item index
let score    = 0;
let answers  = [];     // { item, given, correct, timeout }
let timerIntv  = null;
let timerTO    = null;
let hasAnswered = false;

// ── Boot ───────────────────────────────────────────────────────────────────
async function init() {
  $('btn-back').addEventListener('click', () => { killTimer(); showScreen('home'); });
  $('btn-again').addEventListener('click', playAgain);
  $('btn-home').addEventListener('click', () => showScreen('home'));

  try {
    const quizzes = await loadJSON('quizzes.json');
    renderHome(quizzes);
  } catch {
    $('quiz-list').innerHTML = '<p class="error-msg">Could not load quizzes. Open via a web server or GitHub Pages — <code>file://</code> won\'t work.</p>';
  }
}

// ── Home ───────────────────────────────────────────────────────────────────
function renderHome(quizzes) {
  $('quiz-list').innerHTML = quizzes.map(q => `
    <div class="quiz-card" data-id="${q.id}">
      <img class="quiz-card-thumb"
           src="quizzes/${q.id}/images/${q.thumbnail}"
           alt="${q.title}"
           onerror="this.style.display='none'">
      <div class="quiz-card-body">
        <div class="quiz-card-title">${q.title}</div>
        <div class="quiz-card-desc">${q.description}</div>
        <div class="quiz-card-meta">${q.itemCount} questions &middot; ${q.timePerQuestion}s per image</div>
      </div>
      <button class="quiz-start-btn">Start &rarr;</button>
    </div>
  `).join('');

  $('quiz-list').querySelectorAll('.quiz-card').forEach(card => {
    card.addEventListener('click', () => startQuiz(card.dataset.id));
  });
}

// ── Quiz ───────────────────────────────────────────────────────────────────
async function startQuiz(id) {
  try {
    quiz    = await loadJSON(`quizzes/${id}/quiz.json`);
    items   = shuffle([...quiz.items]);
    idx     = 0;
    score   = 0;
    answers = [];
    showScreen('quiz');
    showQuestion();
  } catch {
    alert('Could not load that quiz.');
  }
}

function showQuestion() {
  const item = items[idx];
  hasAnswered = false;

  $('lbl-counter').textContent = `${idx + 1} / ${items.length}`;
  $('lbl-score').textContent   = `Score: ${score}`;

  // Reset image state
  const img = $('quiz-img');
  img.className = 'quiz-img';
  img.src = `quizzes/${quiz.id}/images/${item.image}`;

  // Reset feedback
  $('feedback-area').hidden = true;

  // Build category buttons
  const btnArea = $('btn-area');
  btnArea.hidden = false;
  btnArea.innerHTML = quiz.categories.map(cat => {
    const cls = cat.toLowerCase() === 'art' ? 'art' : 'eng';
    return `<button class="cat-btn ${cls}" data-cat="${cat}">${cat}</button>`;
  }).join('');
  btnArea.querySelectorAll('.cat-btn').forEach(b => {
    b.addEventListener('click', () => handleAnswer(b.dataset.cat));
  });

  startTimer(quiz.timePerQuestion);
}

// ── Timer ──────────────────────────────────────────────────────────────────
function startTimer(dur) {
  killTimer();

  const bar = $('timer-bar');
  bar.style.transition = 'none';
  bar.style.width = '100%';
  bar.style.backgroundColor = 'var(--correct)';
  void bar.offsetWidth; // force reflow so reset is instant

  bar.style.transition = `width ${dur}s linear, background-color 0.6s ease`;
  bar.style.width = '0%';

  const start = Date.now();
  timerIntv = setInterval(() => {
    const pct = 1 - (Date.now() - start) / (dur * 1000);
    if      (pct > 0.5)  bar.style.backgroundColor = 'var(--correct)';
    else if (pct > 0.25) bar.style.backgroundColor = 'var(--warn)';
    else                 bar.style.backgroundColor = 'var(--wrong)';
  }, 150);

  timerTO = setTimeout(() => {
    if (!hasAnswered) handleAnswer(null);
  }, dur * 1000);
}

function killTimer() {
  clearInterval(timerIntv);
  clearTimeout(timerTO);
  timerIntv = timerTO = null;
}

function freezeTimer() {
  killTimer();
  const bar = $('timer-bar');
  const { width: w } = bar.getBoundingClientRect();
  const { width: pw } = bar.parentElement.getBoundingClientRect();
  bar.style.transition = 'none';
  if (pw > 0) bar.style.width = (w / pw * 100) + '%';
}

// ── Answer ─────────────────────────────────────────────────────────────────
function handleAnswer(cat) {
  if (hasAnswered) return;
  hasAnswered = true;
  freezeTimer();

  const item    = items[idx];
  const timeout = cat === null;
  const correct = !timeout && cat === item.answer;

  if (correct) score++;
  answers.push({ item, given: cat, correct, timeout });

  // Image border feedback
  $('quiz-img').classList.add(correct ? 'correct' : 'wrong');

  // Text feedback
  const lbl = $('feedback-label');
  if (timeout) {
    lbl.textContent  = "Time's up!";
    lbl.className    = 'feedback-label timeout';
  } else if (correct) {
    lbl.textContent  = '✓ Correct!';
    lbl.className    = 'feedback-label correct';
  } else {
    lbl.textContent  = `✗ It's ${item.answer}`;
    lbl.className    = 'feedback-label wrong';
  }
  $('feedback-desc').textContent = item.description;
  $('feedback-area').hidden = false;
  $('btn-area').hidden = true;

  setTimeout(() => {
    idx++;
    if (idx >= items.length) showResults();
    else showQuestion();
  }, 2500);
}

// ── Results ────────────────────────────────────────────────────────────────
function showResults() {
  $('res-score').textContent = score;
  $('res-total').textContent = items.length;

  const pct = score / items.length;
  const msg = pct === 1   ? 'Flawless. No hesitation.'
            : pct >= 0.8  ? 'Sharp eye. Almost perfect.'
            : pct >= 0.6  ? 'Solid. A few tricky ones got you.'
            : pct >= 0.4  ? 'It\'s harder than it looks, isn\'t it?'
            :               'Better luck next time!';
  $('res-message').textContent = msg;

  $('res-items').innerHTML = answers.map(({ item, correct, given, timeout }) => {
    const label = timeout
      ? `Time's up — it's ${item.answer}`
      : correct
        ? `Correct — ${item.answer}`
        : `You said ${given}, it's ${item.answer}`;
    return `
      <div class="res-item ${correct ? 'correct' : 'wrong'}" tabindex="0">
        <img src="quizzes/${quiz.id}/images/${item.image}" alt="" loading="lazy">
        <div class="res-item-badge">${correct ? '✓' : '✗'}</div>
        <div class="res-tooltip">${label}<br><em>${item.description}</em></div>
      </div>
    `;
  }).join('');

  // Tap to toggle tooltip on touch devices
  $('res-items').querySelectorAll('.res-item').forEach(el => {
    el.addEventListener('click', () => {
      const isOpen = el.classList.contains('tip-open');
      $('res-items').querySelectorAll('.res-item').forEach(e => e.classList.remove('tip-open'));
      if (!isOpen) el.classList.add('tip-open');
    });
  });

  showScreen('results');
}

function playAgain() {
  items   = shuffle([...quiz.items]);
  idx     = 0;
  score   = 0;
  answers = [];
  showScreen('quiz');
  showQuestion();
}

// ── Utils ──────────────────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`screen-${name}`).classList.add('active');
  if (name !== 'quiz') killTimer();
}

async function loadJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

init();
