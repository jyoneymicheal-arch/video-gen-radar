/* Video Gen Radar — client interactions: board switching, search, detail modal. */
(function () {
  'use strict';

  var REPOS = [];
  try {
    REPOS = JSON.parse(document.getElementById('repo-data').textContent);
  } catch (e) {
    console.error('failed to parse repo data', e);
  }

  var boards = Array.prototype.slice.call(document.querySelectorAll('.board'));
  var navBtns = Array.prototype.slice.call(document.querySelectorAll('.nav-btn'));
  var input = document.getElementById('q');
  var noResult = document.querySelector('.no-result');
  var dialog = document.getElementById('detail');
  var modalInner = dialog ? dialog.querySelector('.modal-inner') : null;

  var current = 'hot';

  function fmt(n) {
    return (n || 0).toLocaleString('en-US');
  }

  // ------------------------------------------------------------- board view
  function showBoard(id) {
    current = id;
    boards.forEach(function (b) {
      b.hidden = b.dataset.board !== id;
    });
    navBtns.forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.target === id);
    });
    applySearch();
    try {
      history.replaceState(null, '', '#' + id);
    } catch (e) {
      /* ignore */
    }
  }

  navBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      showBoard(btn.dataset.target);
      var head = document.querySelector('.layout');
      if (head && window.scrollY > head.offsetTop) {
        window.scrollTo({ top: head.offsetTop - 60, behavior: 'smooth' });
      }
    });
  });

  // ---------------------------------------------------------------- search
  function applySearch() {
    var term = (input && input.value ? input.value : '').trim().toLowerCase();
    var board = boards.find(function (b) {
      return b.dataset.board === current;
    });
    if (!board) return;

    var rows = Array.prototype.slice.call(board.querySelectorAll('.repo-row'));
    var visible = 0;

    rows.forEach(function (row) {
      var repo = REPOS[Number(row.dataset.idx)];
      var match = !term || (repo && repo.q.indexOf(term) !== -1);
      row.hidden = !match;
      if (match) {
        visible++;
        // Re-number visible rows so ranking stays continuous while filtering.
        var rank = row.querySelector('.rank');
        if (rank) rank.textContent = String(visible).padStart(2, '0');
      }
    });

    var counter = board.querySelector('[data-count]');
    if (counter) counter.textContent = String(visible);
    if (noResult) noResult.hidden = visible !== 0;
  }

  if (input) {
    var t;
    input.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(applySearch, 90);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        input.value = '';
        applySearch();
        input.blur();
      }
    });
  }

  // "/" focuses the search box (unless already typing somewhere).
  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (input) input.focus();
    }
  });

  // ----------------------------------------------------------------- modal
  function chip(text) {
    return '<span class="cat">' + escapeHtml(text) + '</span>';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function openDetail(idx) {
    var r = REPOS[idx];
    if (!r || !dialog || !modalInner) return;

    var tags = []
      .concat([r.type])
      .concat(r.scenes || [])
      .concat(r.boards || [])
      .filter(Boolean)
      .map(chip)
      .join('');

    var topics = (r.topics || []).length
      ? '<p class="m-h4">相关主题</p><div class="m-tags">' +
        r.topics.map(chip).join('') +
        '</div>'
      : '';

    var warn = (r.caveats || []).length
      ? '<div class="m-warn">' +
        r.caveats
          .map(function (c) {
            return '<p>' + escapeHtml(c) + '</p>';
          })
          .join('') +
        '</div>'
      : '';

    var delta =
      r.starsToday !== null && r.starsToday !== undefined && r.starsToday > 0
        ? '<div><span>今日新增</span><strong>+' + fmt(r.starsToday) + '</strong></div>'
        : '';

    modalInner.innerHTML =
      '<button class="m-close" type="button" aria-label="关闭详情">×</button>' +
      '<p class="m-owner">' + escapeHtml(r.owner) + '</p>' +
      '<h3>' + escapeHtml(r.name) + '</h3>' +
      '<a class="m-link" href="' + escapeHtml(r.url) + '" target="_blank" rel="noopener">GitHub ↗</a>' +
      '<div class="m-tags">' + tags + '</div>' +
      '<div class="m-metrics">' +
        '<div><span>Stars</span><strong>' + fmt(r.stars) + '</strong></div>' +
        '<div><span>Forks</span><strong>' + fmt(r.forks) + '</strong></div>' +
        '<div><span>Language</span><strong style="font-size:15px">' + escapeHtml(r.language) + '</strong></div>' +
        delta +
      '</div>' +
      '<p class="m-h4">深度解读</p>' +
      '<p class="m-body">' + escapeHtml(r.analysis) + '</p>' +
      warn +
      '<p class="m-h4">项目简介</p>' +
      '<p class="m-desc">' + escapeHtml(r.description || '（该仓库未填写描述）') + '</p>' +
      topics +
      '<p class="m-foot">更新时间 ' +
        new Date(r.pushed_at).toLocaleString('zh-CN') +
        ' · 创建于 ' +
        new Date(r.created_at).toLocaleDateString('zh-CN') +
        (r.license ? ' · ' + escapeHtml(r.license) : '') +
      '</p>';

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  document.addEventListener('click', function (e) {
    var row = e.target.closest && e.target.closest('.repo-row');
    if (row) {
      openDetail(Number(row.dataset.idx));
      return;
    }
    if (e.target.classList && e.target.classList.contains('m-close')) {
      if (dialog.close) dialog.close();
      else dialog.removeAttribute('open');
    }
  });

  // Click on the backdrop closes the dialog.
  if (dialog) {
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog && dialog.close) dialog.close();
    });
  }

  // -------------------------------------------------------------- bootstrap
  var hash = (location.hash || '').replace('#', '');
  var valid = boards.some(function (b) {
    return b.dataset.board === hash;
  });
  showBoard(valid ? hash : 'hot');
})();
