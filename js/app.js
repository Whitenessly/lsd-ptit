(function () {
  'use strict';

  var QUESTIONS = window.LSD_QUESTIONS || [];
  var META = window.LSD_META || { chapters: [], lmsUnits: [] };
  var STORAGE_KEY = 'lsd_ptit_progress_v1';
  var THEME_KEY = 'lsd_ptit_theme';
  var LETTERS = ['A', 'B', 'C', 'D'];

  var SOURCE_BADGES = {
    lms: { label: 'LMS PTIT Gốc', cls: 'badge-lms' },
    textbook: { label: 'Giáo trình PTIT', cls: 'badge-textbook' },
    video: { label: 'Slide Video LMS', cls: 'badge-video' },
  };

  var config = {
    mode: 'practice',
    source: 'all',
    chapter: 'all',
    unit: 'all',
  };

  var progress = loadProgress();
  var session = null;
  var timerHandle = null;

  // DOM helpers
  function $(id) { return document.getElementById(id); }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function foldVi(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  }

  function shuffleArray(arr) {
    var copy = arr.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function formatDuration(totalSec) {
    var sec = Math.max(0, Math.floor(totalSec));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function loadProgress() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        return {
          mastered: parsed.mastered || {},
          wrong: parsed.wrong || {},
          flagged: parsed.flagged || {},
          totalAnswered: parsed.totalAnswered || 0,
          totalCorrect: parsed.totalCorrect || 0,
        };
      }
    } catch (e) {}
    return { mastered: {}, wrong: {}, flagged: {}, totalAnswered: 0, totalCorrect: 0 };
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (e) {}
  }

  function toggleFlag(qId) {
    if (progress.flagged[qId]) {
      delete progress.flagged[qId];
    } else {
      progress.flagged[qId] = true;
    }
    saveProgress();
    refreshHomeStats();
  }

  function recordOutcome(qId, isCorrect) {
    progress.totalAnswered += 1;
    if (isCorrect) {
      progress.totalCorrect += 1;
      progress.mastered[qId] = true;
      delete progress.wrong[qId];
    } else {
      progress.wrong[qId] = true;
    }
    saveProgress();
  }

  function switchView(viewName) {
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('active', v.id === 'view-' + viewName);
    });
    document.querySelectorAll('.nav-tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.getAttribute('data-view') === viewName);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function getFilteredPool(opts) {
    var source = opts.source || 'all';
    var chapter = opts.chapter || 'all';
    var unit = opts.unit || 'all';
    return QUESTIONS.filter(function (q) {
      if (unit && unit !== 'all') {
        if (q.unit !== unit) return false;
      } else {
        if (chapter !== 'all' && q.chapter !== chapter) return false;
      }
      if (source === 'lms' && q.source !== 'lms') return false;
      if (source === 'extended' && q.source === 'lms') return false;
      if (source === 'textbook' && q.source !== 'textbook') return false;
      if (source === 'video' && q.source !== 'video') return false;
      if (source === 'wrong' && !progress.wrong[q.id]) return false;
      if (source === 'flagged' && !progress.flagged[q.id]) return false;
      return true;
    });
  }

  function populateUnitDropdown() {
    var sel = $('lmsUnitSelect');
    META.lmsUnits.forEach(function (u) {
      var opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = u.label;
      sel.appendChild(opt);
    });
  }

  function refreshHomeStats() {
    var total = QUESTIONS.length;
    var masteredCount = Object.keys(progress.mastered).length;
    var wrongCount = Object.keys(progress.wrong).length;
    var flagCount = Object.keys(progress.flagged).length;

    $('statMastered').textContent = masteredCount + ' / ' + total;
    $('statMasteredBar').style.width = total ? Math.round((masteredCount / total) * 100) + '%' : '0%';
    $('statWrongCount').textContent = wrongCount;
    $('statFlaggedCount').textContent = flagCount;
    $('chipWrongNum').textContent = wrongCount;
    $('chipFlagNum').textContent = flagCount;

    var quickWrong = $('quickWrongBtn');
    quickWrong.textContent = 'Ôn câu sai (' + wrongCount + ')';
    quickWrong.disabled = wrongCount === 0;

    if (progress.totalAnswered > 0) {
      var acc = Math.round((progress.totalCorrect / progress.totalAnswered) * 100);
      $('statAccuracy').textContent = acc + '%';
      $('statAttempts').textContent = progress.totalCorrect + ' / ' + progress.totalAnswered + ' lượt đúng';
    } else {
      $('statAccuracy').textContent = '—';
      $('statAttempts').textContent = 'Chưa có lượt làm';
    }

    // Chapter progress cards
    var listEl = $('chapterProgressList');
    listEl.innerHTML = META.chapters.map(function (c) {
      var qs = QUESTIONS.filter(function (q) { return q.chapter === c.id; });
      var done = qs.filter(function (q) { return progress.mastered[q.id]; }).length;
      var pct = qs.length ? Math.round((done / qs.length) * 100) : 0;
      return (
        '<div class="chapter-card" data-quick-chap="' + escapeHtml(c.id) + '">' +
          '<div class="chapter-card-top">' +
            '<span class="chapter-code">' + escapeHtml(c.code) + ' · ' + qs.length + ' câu</span>' +
            '<span class="chapter-progress-text">' + done + '/' + qs.length + ' (' + pct + '%)</span>' +
          '</div>' +
          '<div class="chapter-title">' + escapeHtml(c.title) + '</div>' +
          '<div class="mini-progress"><div class="mini-progress-fill" style="width:' + pct + '%"></div></div>' +
        '</div>'
      );
    }).join('');

    listEl.querySelectorAll('.chapter-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var ch = card.getAttribute('data-quick-chap');
        startSession({
          mode: 'practice',
          source: 'all',
          chapter: ch,
          unit: 'all',
          count: 'all',
          shuffleQuestions: true,
          shuffleOptions: true,
        });
      });
    });

    updatePoolPreview();
  }

  function updatePoolPreview() {
    var pool = getFilteredPool(config);
    $('matchingPoolCount').textContent = pool.length;
    $('startCustomSessionBtn').disabled = pool.length === 0;
  }

  // SESSION MANAGEMENT
  function cloneQuestionForSession(q, doShuffleOptions) {
    if (!doShuffleOptions || session.mode === 'flashcard') {
      return {
        raw: q,
        options: q.options.slice(),
        correct: q.correct,
        picked: null,
        revealed: false,
      };
    }
    var indexed = q.options.map(function (text, idx) { return { text: text, idx: idx }; });
    indexed = shuffleArray(indexed);
    return {
      raw: q,
      options: indexed.map(function (item) { return item.text; }),
      correct: indexed.findIndex(function (item) { return item.idx === q.correct; }),
      picked: null,
      revealed: false,
    };
  }

  function stopTimer() {
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
  }

  function startSession(opts) {
    stopTimer();
    var pool = getFilteredPool(opts);
    if (!pool.length) {
      alert('Không có câu hỏi nào phù hợp với bộ lọc đã chọn.');
      return;
    }

    var ordered = opts.shuffleQuestions ? shuffleArray(pool) : pool.slice();
    if (opts.count !== 'all') {
      var limit = parseInt(opts.count, 10);
      if (limit > 0 && ordered.length > limit) {
        ordered = ordered.slice(0, limit);
      }
    }

    // Standard exam timer: 45 min for 40Q, 60 min for >= 60Q, otherwise 75s/question
    var isExam = opts.mode === 'exam';
    var examSeconds = ordered.length === 40 ? 45 * 60 : (ordered.length >= 60 ? 60 * 60 : Math.max(120, ordered.length * 75));

    session = {
      mode: opts.mode,
      items: [],
      index: 0,
      startedAt: Date.now(),
      elapsedSec: 0,
      examLimitSec: isExam ? examSeconds : null,
      submitted: false,
    };
    session.items = ordered.map(function (q) { return cloneQuestionForSession(q, opts.shuffleOptions); });

    var modeLabel = opts.mode === 'exam' ? 'Thi thử tính giờ' : (opts.mode === 'flashcard' ? 'Flashcard' : 'Luyện tập');
    $('sessionModeBadge').textContent = modeLabel;
    $('finishSessionBtn').style.display = opts.mode === 'flashcard' ? 'none' : 'inline-flex';
    $('finishSessionBtn').textContent = isExam ? 'Nộp bài thi' : 'Kết thúc & Tổng kết';
    $('palettePanel').style.display = opts.mode === 'flashcard' ? 'none' : 'block';
    $('quizLayout').style.gridTemplateColumns = opts.mode === 'flashcard' ? '1fr' : '';

    switchView('session');
    renderSession();
    startSessionTimer();
  }

  function startSessionTimer() {
    updateTimerDisplay();
    timerHandle = setInterval(function () {
      if (!session || session.submitted) return;
      session.elapsedSec = Math.floor((Date.now() - session.startedAt) / 1000);
      updateTimerDisplay();
      if (session.mode === 'exam' && session.elapsedSec >= session.examLimitSec) {
        submitSession(true);
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    var pill = $('sessionTimer');
    if (!session) return;
    if (session.mode === 'exam') {
      var rem = Math.max(0, session.examLimitSec - session.elapsedSec);
      pill.textContent = '⏱ ' + formatDuration(rem);
      pill.classList.toggle('warning', rem <= 120);
    } else {
      pill.textContent = formatDuration(session.elapsedSec);
      pill.classList.remove('warning');
    }
  }

  function renderSession() {
    if (!session) return;
    var item = session.items[session.index];
    var q = item.raw;
    var total = session.items.length;

    $('sessionCounter').textContent = 'Câu ' + (session.index + 1) + ' / ' + total;
    $('sessionProgressFill').style.width = Math.round(((session.index + 1) / total) * 100) + '%';

    var badge = SOURCE_BADGES[q.source] || SOURCE_BADGES.textbook;
    var isFlagged = !!progress.flagged[q.id];

    if (session.mode === 'flashcard') {
      renderFlashcard(item, q, badge, isFlagged, total);
      return;
    }

    var isLocked = session.mode === 'practice' && item.picked !== null;
    var optsHtml = item.options.map(function (optText, idx) {
      var cls = 'option-btn';
      if (isLocked) {
        if (idx === item.correct) cls += ' correct';
        else if (idx === item.picked) cls += ' wrong';
      } else if (item.picked === idx) {
        cls += ' selected';
      }
      return (
        '<button type="button" class="' + cls + '" data-opt="' + idx + '"' + (isLocked ? ' disabled' : '') + '>' +
          '<span class="option-letter">' + LETTERS[idx] + '</span>' +
          '<span>' + escapeHtml(optText) + '</span>' +
        '</button>'
      );
    }).join('');

    var expHtml = '';
    if (isLocked) {
      var ok = item.picked === item.correct;
      expHtml =
        '<div class="explanation-box ' + (ok ? '' : 'is-wrong') + '">' +
          '<div class="explanation-box-head">' +
            '<span>' + (ok ? '✅ Chính xác!' : '❌ Chưa chính xác — Đáp án đúng là ' + LETTERS[item.correct]) + '</span>' +
            '<span class="explanation-ref">' + escapeHtml(q.ref) + '</span>' +
          '</div>' +
          '<div>' + escapeHtml(q.explanation) + '</div>' +
        '</div>';
    }

    $('questionStage').innerHTML =
      '<div class="question-card">' +
        '<div class="q-header">' +
          '<div class="q-badges">' +
            '<span class="badge ' + badge.cls + '">' + escapeHtml(badge.label) + '</span>' +
            '<span class="badge badge-topic">' + escapeHtml(q.topic) + '</span>' +
          '</div>' +
          '<button type="button" class="flag-btn ' + (isFlagged ? 'flagged' : '') + '" id="toggleFlagBtn">' +
            (isFlagged ? '★ Đã đánh dấu' : '☆ Đánh dấu (F)') +
          '</button>' +
        '</div>' +
        '<h2 class="q-title">Câu ' + (session.index + 1) + ': ' + escapeHtml(q.question) + '</h2>' +
        '<div class="options-list">' + optsHtml + '</div>' +
        expHtml +
        '<div class="q-nav-footer">' +
          '<button type="button" class="btn btn-secondary" id="prevQBtn"' + (session.index === 0 ? ' disabled' : '') + '>← Câu trước</button>' +
          '<span class="kbd-hints">Phím tắt: A–D / 1–4 chọn đáp án · ← / → chuyển câu</span>' +
          (session.index === total - 1
            ? '<button type="button" class="btn btn-primary" id="nextFinishBtn">Nộp bài →</button>'
            : '<button type="button" class="btn btn-primary" id="nextQBtn">Câu tiếp →</button>') +
        '</div>' +
      '</div>';

    // Bind events
    $('questionStage').querySelectorAll('.option-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        chooseOption(parseInt(btn.getAttribute('data-opt'), 10));
      });
    });

    $('toggleFlagBtn').addEventListener('click', function () {
      toggleFlag(q.id);
      renderSession();
    });

    var prevBtn = $('prevQBtn');
    if (prevBtn) prevBtn.addEventListener('click', function () { goQuestion(session.index - 1); });
    var nextBtn = $('nextQBtn');
    if (nextBtn) nextBtn.addEventListener('click', function () { goQuestion(session.index + 1); });
    var nfBtn = $('nextFinishBtn');
    if (nfBtn) nfBtn.addEventListener('click', function () { confirmSubmit(); });

    renderPalette();
  }

  function renderFlashcard(item, q, badge, isFlagged, total) {
    var ansHtml = item.revealed
      ? '<div class="flashcard-answer">' +
          '<strong>Đáp án đúng: ' + escapeHtml(item.options[item.correct]) + '</strong>' +
          '<p style="margin:6px 0 4px;font-size:0.9rem">' + escapeHtml(q.explanation) + '</p>' +
          '<small class="explanation-ref">Nguồn: ' + escapeHtml(q.ref) + '</small>' +
        '</div>'
      : '<div style="margin-top:18px"><button type="button" class="btn btn-primary" id="revealFlashBtn">👁 Lật xem đáp án &amp; giải thích (Space)</button></div>';

    var selfAssess = item.revealed
      ? '<div style="display:flex;gap:10px;margin-top:12px">' +
          '<button type="button" class="btn btn-secondary btn-sm" id="fcNeedReviewBtn">Cần ôn lại</button>' +
          '<button type="button" class="btn btn-primary btn-sm" id="fcGotItBtn">✓ Đã nhớ, sang câu tiếp →</button>' +
        '</div>'
      : '';

    $('questionStage').innerHTML =
      '<div class="question-card flashcard-stage">' +
        '<div class="q-header">' +
          '<div class="q-badges">' +
            '<span class="badge ' + badge.cls + '">' + escapeHtml(badge.label) + '</span>' +
            '<span class="badge badge-topic">' + escapeHtml(q.topic) + '</span>' +
          '</div>' +
          '<button type="button" class="flag-btn ' + (isFlagged ? 'flagged' : '') + '" id="toggleFlagBtn">' +
            (isFlagged ? '★ Đã đánh dấu' : '☆ Đánh dấu') +
          '</button>' +
        '</div>' +
        '<h2 class="q-title">' + escapeHtml(q.question) + '</h2>' +
        ansHtml +
        selfAssess +
        '<div class="q-nav-footer">' +
          '<button type="button" class="btn btn-secondary" id="prevQBtn"' + (session.index === 0 ? ' disabled' : '') + '>← Thẻ trước</button>' +
          '<button type="button" class="btn btn-primary" id="nextQBtn"' + (session.index === total - 1 ? ' disabled' : '') + '>Thẻ tiếp →</button>' +
        '</div>' +
      '</div>';

    $('toggleFlagBtn').addEventListener('click', function () {
      toggleFlag(q.id);
      renderSession();
    });
    var revBtn = $('revealFlashBtn');
    if (revBtn) {
      revBtn.addEventListener('click', function () {
        item.revealed = true;
        renderSession();
      });
    }
    var gotBtn = $('fcGotItBtn');
    if (gotBtn) {
      gotBtn.addEventListener('click', function () {
        recordOutcome(q.id, true);
        refreshHomeStats();
        if (session.index < total - 1) goQuestion(session.index + 1);
      });
    }
    var revNeed = $('fcNeedReviewBtn');
    if (revNeed) {
      revNeed.addEventListener('click', function () {
        recordOutcome(q.id, false);
        refreshHomeStats();
        if (session.index < total - 1) goQuestion(session.index + 1);
      });
    }
    var prevBtn = $('prevQBtn');
    if (prevBtn) prevBtn.addEventListener('click', function () { goQuestion(session.index - 1); });
    var nextBtn = $('nextQBtn');
    if (nextBtn) nextBtn.addEventListener('click', function () { goQuestion(session.index + 1); });
  }

  function chooseOption(optIdx) {
    if (!session || session.submitted) return;
    var item = session.items[session.index];
    if (session.mode === 'practice') {
      if (item.picked !== null) return;
      item.picked = optIdx;
      recordOutcome(item.raw.id, optIdx === item.correct);
      refreshHomeStats();
      renderSession();
    } else if (session.mode === 'exam') {
      item.picked = optIdx;
      renderSession();
    }
  }

  function goQuestion(newIdx) {
    if (!session) return;
    if (newIdx < 0 || newIdx >= session.items.length) return;
    session.index = newIdx;
    renderSession();
  }

  function renderPalette() {
    var items = session.items;
    var answeredCount = items.filter(function (it) { return it.picked !== null; }).length;
    $('paletteAnsweredStats').textContent = answeredCount + ' / ' + items.length + ' đã chọn';

    var grid = $('paletteGrid');
    grid.innerHTML = items.map(function (it, i) {
      var cls = 'p-cell';
      if (i === session.index) cls += ' current';
      if (session.mode === 'practice' && it.picked !== null) {
        cls += it.picked === it.correct ? ' correct' : ' wrong';
      } else if (it.picked !== null) {
        cls += ' answered';
      }
      if (progress.flagged[it.raw.id]) cls += ' flagged';
      return '<button type="button" class="' + cls + '" data-pidx="' + i + '">' + (i + 1) + '</button>';
    }).join('');

    grid.querySelectorAll('.p-cell').forEach(function (cell) {
      cell.addEventListener('click', function () {
        goQuestion(parseInt(cell.getAttribute('data-pidx'), 10));
      });
    });
  }

  function confirmSubmit() {
    if (!session) return;
    var unanswered = session.items.filter(function (it) { return it.picked === null; }).length;
    if (unanswered > 0 && session.mode === 'exam') {
      if (!confirm('Bạn còn ' + unanswered + ' câu chưa trả lời. Bạn vẫn muốn nộp bài ngay?')) return;
    }
    submitSession(false);
  }

  function submitSession(isTimeout) {
    if (!session || session.submitted) return;
    stopTimer();
    session.submitted = true;
    session.elapsedSec = Math.floor((Date.now() - session.startedAt) / 1000);

    var correctCount = 0;
    var wrongIds = [];

    session.items.forEach(function (it) {
      var ok = it.picked === it.correct;
      if (ok) correctCount += 1;
      else wrongIds.push(it.raw.id);

      // In exam mode, record all outcomes on submission
      if (session.mode === 'exam') {
        recordOutcome(it.raw.id, ok);
      }
    });
    refreshHomeStats();

    var total = session.items.length;
    var pct = Math.round((correctCount / total) * 100);
    var score10 = ((correctCount / total) * 10).toFixed(2);
    var passed = pct >= 50;

    renderResult(correctCount, total, pct, score10, passed, wrongIds, isTimeout);
    switchView('result');
  }

  function renderResult(correctCount, total, pct, score10, passed, wrongIds, isTimeout) {
    var html =
      '<div class="result-hero">' +
        '<div class="score-circle ' + (passed ? '' : 'fail') + '">' +
          '<strong>' + score10 + '</strong>' +
          '<span>Điểm / 10 (' + pct + '%)</span>' +
        '</div>' +
        '<div class="result-details">' +
          '<h2>' + (isTimeout ? 'Hết thời gian làm bài! ' : '') + (passed ? '🎉 Chúc mừng, bạn đã ĐẠT yêu cầu!' : '📚 Cần ôn luyện thêm!') + '</h2>' +
          '<div class="result-metrics">' +
            '<span>Đúng: <strong>' + correctCount + ' / ' + total + ' câu</strong></span>' +
            '<span>Thời gian: <strong>' + formatDuration(session.elapsedSec) + '</strong></span>' +
            '<span>Ngưỡng đạt PTIT: <strong>≥ 50% (5.0 điểm)</strong></span>' +
          '</div>' +
          '<div class="result-actions">' +
            (wrongIds.length
              ? '<button type="button" class="btn btn-primary" id="retryWrongSessionBtn">Ôn ngay ' + wrongIds.length + ' câu chưa đúng</button>'
              : '') +
            '<button type="button" class="btn btn-secondary" id="resultBackHomeBtn">Về trang chủ</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<div class="review-toolbar">' +
          '<h3 style="margin:0">Chi tiết bài làm</h3>' +
          '<div class="chip-row" id="reviewFilterRow">' +
            '<button type="button" class="chip active" data-rfilter="all">Tất cả (' + total + ')</button>' +
            '<button type="button" class="chip" data-rfilter="wrong">Chỉ câu sai / bỏ trống (' + wrongIds.length + ')</button>' +
          '</div>' +
        '</div>' +
        '<div id="reviewList"></div>' +
      '</div>';

    $('resultContainer').innerHTML = html;

    function drawReview(filter) {
      var listEl = $('reviewList');
      listEl.innerHTML = session.items.map(function (it, idx) {
        var ok = it.picked === it.correct;
        if (filter === 'wrong' && ok) return '';
        var q = it.raw;
        var optsHtml = it.options.map(function (o, oi) {
          var cls = 'review-opt';
          var tag = '';
          if (oi === it.correct) { cls += ' is-correct'; tag = ' ✓ Đáp án đúng'; }
          else if (oi === it.picked) { cls += ' is-picked-wrong'; tag = ' ✗ Bạn chọn'; }
          return '<div class="' + cls + '"><strong>' + LETTERS[oi] + '.</strong> ' + escapeHtml(o) + '<small style="margin-left:8px;font-weight:700">' + tag + '</small></div>';
        }).join('');

        return (
          '<div class="review-card ' + (ok ? '' : 'is-wrong') + '">' +
            '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px">' +
              '<strong>Câu ' + (idx + 1) + ' · ' + (ok ? '✅ Đúng' : (it.picked === null ? '⚠ Bỏ trống' : '❌ Sai')) + '</strong>' +
              '<span class="explanation-ref">' + escapeHtml(q.ref) + '</span>' +
            '</div>' +
            '<div>' + escapeHtml(q.question) + '</div>' +
            '<div class="review-opts">' + optsHtml + '</div>' +
            '<div style="font-size:0.86rem;color:var(--text-muted)"><strong>Giải thích:</strong> ' + escapeHtml(q.explanation) + '</div>' +
          '</div>'
        );
      }).join('') || '<p style="color:var(--text-muted)">Không có câu sai nào — quá xuất sắc!</p>';
    }

    drawReview('all');

    $('reviewFilterRow').querySelectorAll('.chip').forEach(function (c) {
      c.addEventListener('click', function () {
        $('reviewFilterRow').querySelectorAll('.chip').forEach(function (x) { x.classList.remove('active'); });
        c.classList.add('active');
        drawReview(c.getAttribute('data-rfilter'));
      });
    });

    var retryBtn = $('retryWrongSessionBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', function () {
        var wrongItems = session.items.filter(function (it) { return it.picked !== it.correct; }).map(function (it) { return it.raw; });
        startCustomQuestions(wrongItems, 'practice');
      });
    }
    $('resultBackHomeBtn').addEventListener('click', function () { switchView('home'); });
  }

  function startCustomQuestions(rawQuestions, mode) {
    stopTimer();
    session = {
      mode: mode,
      items: [],
      index: 0,
      startedAt: Date.now(),
      elapsedSec: 0,
      examLimitSec: null,
      submitted: false,
    };
    session.items = shuffleArray(rawQuestions).map(function (q) { return cloneQuestionForSession(q, true); });
    $('sessionModeBadge').textContent = 'Ôn câu sai';
    $('finishSessionBtn').style.display = 'inline-flex';
    $('finishSessionBtn').textContent = 'Kết thúc & Tổng kết';
    $('palettePanel').style.display = 'block';
    $('quizLayout').style.gridTemplateColumns = '';
    switchView('session');
    renderSession();
    startSessionTimer();
  }

  // QUESTION BANK EXPLORER
  function renderBankList() {
    var query = foldVi($('bankSearchInput').value.trim());
    var ch = $('bankChapterSelect').value;
    var src = $('bankSourceSelect').value;
    var showAns = $('bankShowAnswersToggle').checked;

    var filtered = getFilteredPool({ chapter: ch, source: src, unit: 'all' }).filter(function (q) {
      if (!query) return true;
      var hay = foldVi(q.question + ' ' + q.options.join(' ') + ' ' + q.explanation + ' ' + q.topic + ' ' + q.ref);
      return hay.indexOf(query) !== -1;
    });

    $('bankCountLabel').textContent = 'Hiển thị ' + filtered.length + ' câu';

    $('bankList').innerHTML = filtered.map(function (q, idx) {
      var badge = SOURCE_BADGES[q.source] || SOURCE_BADGES.textbook;
      var isFlagged = !!progress.flagged[q.id];
      var optsHtml = q.options.map(function (opt, oi) {
        var isCor = showAns && oi === q.correct;
        return '<div class="review-opt ' + (isCor ? 'is-correct' : '') + '"><strong>' + LETTERS[oi] + '.</strong> ' + escapeHtml(opt) + '</div>';
      }).join('');

      var expBlock = showAns
        ? '<div class="explanation-box" style="margin-top:10px">' +
            '<div class="explanation-box-head"><span>Giải thích</span><span class="explanation-ref">' + escapeHtml(q.ref) + '</span></div>' +
            '<div>' + escapeHtml(q.explanation) + '</div>' +
          '</div>'
        : '';

      return (
        '<article class="bank-item">' +
          '<div class="q-header">' +
            '<div class="q-badges">' +
              '<span class="badge ' + badge.cls + '">' + escapeHtml(badge.label) + '</span>' +
              '<span class="badge badge-topic">' + escapeHtml(q.topic) + '</span>' +
            '</div>' +
            '<button type="button" class="flag-btn bank-flag ' + (isFlagged ? 'flagged' : '') + '" data-qid="' + escapeHtml(q.id) + '">' +
              (isFlagged ? '★ Đã lưu' : '☆ Lưu câu') +
            '</button>' +
          '</div>' +
          '<div class="bank-item-q">#' + (idx + 1) + '. ' + escapeHtml(q.question) + '</div>' +
          '<div class="review-opts">' + optsHtml + '</div>' +
          expBlock +
        '</article>'
      );
    }).join('') || '<div class="panel"><p style="margin:0;color:var(--text-muted)">Không tìm thấy câu hỏi nào khớp với từ khóa tìm kiếm.</p></div>';

    $('bankList').querySelectorAll('.bank-flag').forEach(function (btn) {
      btn.addEventListener('click', function () {
        toggleFlag(btn.getAttribute('data-qid'));
        renderBankList();
      });
    });
  }

  // WIRE UP EVENTS
  function init() {
    populateUnitDropdown();
    refreshHomeStats();
    renderBankList();

    // Theme toggle
    $('themeToggle').addEventListener('click', function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (dark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem(THEME_KEY, 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem(THEME_KEY, 'dark');
      }
    });

    // Topbar navigation
    document.querySelectorAll('.nav-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        stopTimer();
        var target = tab.getAttribute('data-view');
        if (target === 'bank') renderBankList();
        switchView(target);
      });
    });
    $('brandHomeBtn').addEventListener('click', function () {
      stopTimer();
      switchView('home');
    });

    // Mode select
    $('modeSelect').querySelectorAll('.seg-card').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $('modeSelect').querySelectorAll('.seg-card').forEach(function (x) { x.classList.remove('active'); });
        btn.classList.add('active');
        config.mode = btn.getAttribute('data-mode');
      });
    });

    // Source filter
    $('sourceFilter').querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        $('sourceFilter').querySelectorAll('.chip').forEach(function (x) { x.classList.remove('active'); });
        chip.classList.add('active');
        config.source = chip.getAttribute('data-source');
        updatePoolPreview();
      });
    });

    // Chapter filter
    $('chapterFilter').querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        $('chapterFilter').querySelectorAll('.chip').forEach(function (x) { x.classList.remove('active'); });
        chip.classList.add('active');
        config.chapter = chip.getAttribute('data-chapter');
        $('lmsUnitSelect').value = 'all';
        config.unit = 'all';
        updatePoolPreview();
      });
    });

    $('lmsUnitSelect').addEventListener('change', function (e) {
      config.unit = e.target.value;
      if (config.unit !== 'all') {
        config.source = 'lms';
        $('sourceFilter').querySelectorAll('.chip').forEach(function (x) {
          x.classList.toggle('active', x.getAttribute('data-source') === 'lms');
        });
      }
      updatePoolPreview();
    });

    // Start buttons
    $('startCustomSessionBtn').addEventListener('click', function () {
      startSession({
        mode: config.mode,
        source: config.source,
        chapter: config.chapter,
        unit: config.unit,
        count: $('countSelect').value,
        shuffleQuestions: $('shuffleQuestionsToggle').checked,
        shuffleOptions: $('shuffleOptionsToggle').checked,
      });
    });

    $('quickMock40Btn').addEventListener('click', function () {
      startSession({
        mode: 'exam',
        source: 'all',
        chapter: 'all',
        unit: 'all',
        count: '40',
        shuffleQuestions: true,
        shuffleOptions: true,
      });
    });

    $('quickPracticeLmsBtn').addEventListener('click', function () {
      startSession({
        mode: 'practice',
        source: 'lms',
        chapter: 'all',
        unit: 'all',
        count: 'all',
        shuffleQuestions: false,
        shuffleOptions: true,
      });
    });

    $('quickWrongBtn').addEventListener('click', function () {
      startSession({
        mode: 'practice',
        source: 'wrong',
        chapter: 'all',
        unit: 'all',
        count: 'all',
        shuffleQuestions: true,
        shuffleOptions: true,
      });
    });

    $('resetProgressBtn').addEventListener('click', function () {
      if (!confirm('Xóa toàn bộ tiến độ học tập, câu sai và câu đánh dấu đã lưu trên trình duyệt?')) return;
      progress = { mastered: {}, wrong: {}, flagged: {}, totalAnswered: 0, totalCorrect: 0 };
      saveProgress();
      refreshHomeStats();
      renderBankList();
    });

    $('exitSessionBtn').addEventListener('click', function () {
      if (session && !session.submitted && session.mode === 'exam') {
        if (!confirm('Bạn đang trong giờ thi thử, thoát ra sẽ hủy lượt thi này. Tiếp tục?')) return;
      }
      stopTimer();
      session = null;
      switchView('home');
    });

    $('finishSessionBtn').addEventListener('click', confirmSubmit);

    // Bank search / filter
    $('bankSearchInput').addEventListener('input', renderBankList);
    $('bankChapterSelect').addEventListener('change', renderBankList);
    $('bankSourceSelect').addEventListener('change', renderBankList);
    $('bankShowAnswersToggle').addEventListener('change', renderBankList);

    // Keyboard shortcuts during quiz/flashcard session
    document.addEventListener('keydown', function (e) {
      if (!$('view-session').classList.contains('active') || !session || session.submitted) return;
      var tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

      var key = e.key.toLowerCase();
      if (session.mode === 'flashcard') {
        if (key === ' ') {
          e.preventDefault();
          session.items[session.index].revealed = true;
          renderSession();
        } else if (key === 'arrowright') goQuestion(session.index + 1);
        else if (key === 'arrowleft') goQuestion(session.index - 1);
        return;
      }

      var map = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3 };
      if (key in map) {
        e.preventDefault();
        chooseOption(map[key]);
      } else if (key === 'arrowright' || key === 'enter') {
        if (session.index < session.items.length - 1) goQuestion(session.index + 1);
      } else if (key === 'arrowleft') {
        if (session.index > 0) goQuestion(session.index - 1);
      } else if (key === 'f') {
        toggleFlag(session.items[session.index].raw.id);
        renderSession();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
