/* =============================================================================
 * GI Lernwelt – site.js
 * -----------------------------------------------------------------------------
 * Zentrales Skript für die spielerische Lernwelt. Es stellt drei Bausteine
 * bereit, die auf allen Seiten wiederverwendet werden:
 *
 *   1) Fortschritt  -> welche Level sind abgeschlossen (localStorage)
 *   2) Quiz-Widget  -> Fragen + Auswertung; bei Bestehen wird das Level
 *                      abgeschlossen und das nächste freigeschaltet
 *   3) Maskottchen  -> einheitliche Sprechblasen ("Lumi" erklärt)
 *
 * Wird über `include-after-body` (siehe _quarto.yml) auf jeder Seite geladen.
 * Da das Skript NACH dem Seiteninhalt eingebunden wird, dürfen Seiten die API
 * nicht inline aufrufen. Stattdessen nutzen sie deklaratives Markup
 * (data-Attribute), das hier beim DOMContentLoaded automatisch ausgewertet
 * wird. Die programmatische API steht zusätzlich unter `window.VCDE` bereit.
 *
 * -----------------------------------------------------------------------------
 * Öffentliche API (window.VCDE)
 * -----------------------------------------------------------------------------
 *  Konfiguration / Abfragen:
 *    VCDE.getLevels()            -> Array<Level>   (kanonische, geordnete Liste)
 *    VCDE.getLevel(id)           -> Level | null
 *    VCDE.getNextLevel(id)       -> Level | null   (nächstes Level in der Reihe)
 *    VCDE.getProgress()          -> { completed: string[] }
 *    VCDE.isCompleted(id)        -> boolean
 *    VCDE.isUnlocked(id)         -> boolean         (Level 1 immer; sonst Vorgänger fertig)
 *    VCDE.completedCount()       -> number
 *
 *  Aktionen:
 *    VCDE.markComplete(id)       -> Level | null    (markiert fertig, gibt nächstes Level zurück)
 *    VCDE.resetProgress()        -> void            (löscht den Fortschritt)
 *
 *  Rendering:
 *    VCDE.renderMap(el)                  -> rendert Level-Karten in `el`
 *    VCDE.renderProgress(el)             -> rendert Fortschrittsbalken in `el`
 *    VCDE.renderQuiz(el, config)         -> rendert ein Quiz in `el`
 *    VCDE.mascotHTML(opts)               -> string  (HTML einer Sprechblase)
 *    VCDE.mountMascot(el, opts)          -> füllt `el` mit einer Sprechblase
 *
 *  `el` darf jeweils ein Element ODER ein CSS-Selektor (String) sein.
 *
 *  Quiz-Config:
 *    {
 *      levelId: "local-vs-global",          // welches Level wird abgeschlossen
 *      title:   "Abschluss-Quiz",           // optional
 *      intro:   "Beantworte ...",           // optional
 *      passRatio: 0.7,                        // Anteil korrekter Antworten zum Bestehen (Default 0.7)
 *      questions: [
 *        { q: "Frage?", options: ["A","B","C"], answer: 1, explain: "weil ..." },
 *        ...
 *      ]
 *    }
 * ========================================================================== */

(function () {
  "use strict";

  var STORAGE_KEY = "vcde-progress-v1";

  // ---- Kanonische Level-Reihenfolge ----------------------------------------
  // Eine einzige Quelle der Wahrheit für Landkarte UND Freischalt-Logik.
  // `href` ist relativ zum Seitenstamm; renderMap passt den Pfad an die
  // aktuelle Seitentiefe an.
  var LEVELS = [
    {
      id: "local-vs-global",
      title: "Lokal vs. Global",
      icon: "💡",
      href: "levels/local-vs-global.html",
      desc: "Die Rendering-Gleichung als roter Faden: Warum reicht lokales Licht nicht und was macht Global Illumination anders?"
    },
    {
      id: "ray-tracing",
      title: "Ray Tracing",
      icon: "🔦",
      href: "levels/ray-tracing.html",
      desc: "Von Primärstrahlen über Anti-Aliasing bis zu diffusen Bounces – Schritt für Schritt durch den Ray Tracer."
    },
    {
      id: "path-tracing",
      title: "Path Tracing",
      icon: "🌌",
      href: "levels/path-tracing.html",
      desc: "Monte-Carlo-Pfade, Konvergenz und Russian Roulette: physikalisch plausible globale Beleuchtung."
    }
  ];

  // ---- Fortschritt (localStorage) ------------------------------------------
  function readProgress() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { completed: [] };
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.completed)) return { completed: [] };
      return { completed: data.completed.slice() };
    } catch (e) {
      return { completed: [] };
    }
  }

  function writeProgress(progress) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (e) {
      /* localStorage evtl. nicht verfügbar – Lernwelt funktioniert trotzdem */
    }
  }

  function levelIndex(id) {
    for (var i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].id === id) return i;
    }
    return -1;
  }

  // ---- API: Abfragen --------------------------------------------------------
  function getLevels() {
    return LEVELS.slice();
  }

  function getLevel(id) {
    var i = levelIndex(id);
    return i === -1 ? null : LEVELS[i];
  }

  function getNextLevel(id) {
    var i = levelIndex(id);
    if (i === -1 || i + 1 >= LEVELS.length) return null;
    return LEVELS[i + 1];
  }

  function getProgress() {
    return readProgress();
  }

  function isCompleted(id) {
    return readProgress().completed.indexOf(id) !== -1;
  }

  // Level 1 ist immer offen. Jedes weitere Level ist offen, sobald sein
  // direkter Vorgänger abgeschlossen wurde.
  function isUnlocked(id) {
    var i = levelIndex(id);
    if (i <= 0) return true;
    return isCompleted(LEVELS[i - 1].id);
  }

  function completedCount() {
    return readProgress().completed.filter(function (id) {
      return levelIndex(id) !== -1;
    }).length;
  }

  // ---- API: Aktionen --------------------------------------------------------
  function markComplete(id) {
    var progress = readProgress();
    if (progress.completed.indexOf(id) === -1) {
      progress.completed.push(id);
      writeProgress(progress);
    }
    return getNextLevel(id);
  }

  function resetProgress() {
    writeProgress({ completed: [] });
  }

  // ---- Hilfsfunktionen ------------------------------------------------------
  function resolve(el) {
    if (!el) return null;
    if (typeof el === "string") return document.querySelector(el);
    return el;
  }

  // Pfad-Präfix passend zur aktuellen Seitentiefe bestimmen, damit
  // `levels/foo.html` von einer Level-Seite aus zu `../levels/foo.html` wird.
  function pathPrefix() {
    // Quarto-Seiten in /levels/ liegen eine Ebene tiefer.
    var path = window.location.pathname;
    return /\/levels\//.test(path) ? "../" : "";
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---- Rendering: Landkarte -------------------------------------------------
  function renderMap(target) {
    var el = resolve(target);
    if (!el) return;

    var prefix = pathPrefix();
    var html = '<div class="vcde-map">';

    LEVELS.forEach(function (lvl, idx) {
      var completed = isCompleted(lvl.id);
      var unlocked = isUnlocked(lvl.id);
      var statusClass = completed ? "completed" : (unlocked ? "open" : "locked");

      var badge, badgeText, cta, lockIcon;
      if (completed) {
        badge = "vcde-badge--completed";
        badgeText = "✓ Abgeschlossen";
        cta = "Nochmal spielen →";
        lockIcon = "";
      } else if (unlocked) {
        badge = "vcde-badge--open";
        badgeText = "Offen";
        cta = "Level starten →";
        lockIcon = "";
      } else {
        badge = "vcde-badge--locked";
        badgeText = "Gesperrt";
        cta = "Erst Vorgänger abschließen";
        lockIcon = '<span class="vcde-card__lock" aria-hidden="true">🔒</span>';
      }

      var inner =
        lockIcon +
        '<div class="vcde-card__top">' +
          '<div class="vcde-card__icon" aria-hidden="true">' + (completed ? "✅" : lvl.icon) + "</div>" +
          "<div>" +
            '<div class="vcde-card__num">Level ' + (idx + 1) + "</div>" +
            '<h3 class="vcde-card__title">' + escapeHTML(lvl.title) + "</h3>" +
          "</div>" +
        "</div>" +
        '<p class="vcde-card__desc">' + escapeHTML(lvl.desc) + "</p>" +
        '<div class="vcde-card__foot">' +
          '<span class="vcde-badge ' + badge + '">' + badgeText + "</span>" +
          '<span class="vcde-card__cta">' + cta + "</span>" +
        "</div>";

      if (unlocked) {
        html +=
          '<a class="vcde-card vcde-card--' + statusClass + '" href="' +
          prefix + lvl.href + '">' + inner + "</a>";
      } else {
        html +=
          '<div class="vcde-card vcde-card--' + statusClass +
          '" aria-disabled="true" title="Dieses Level ist noch gesperrt.">' +
          inner + "</div>";
      }
    });

    html += "</div>";
    el.innerHTML = html;
  }

  // ---- Rendering: Fortschrittsbalken ---------------------------------------
  function renderProgress(target) {
    var el = resolve(target);
    if (!el) return;

    var total = LEVELS.length;
    var done = completedCount();
    var pct = total === 0 ? 0 : Math.round((done / total) * 100);

    el.innerHTML =
      '<div class="vcde-progress">' +
        '<div class="vcde-progress__bar">' +
          '<div class="vcde-progress__fill" style="width:' + pct + '%"></div>' +
        "</div>" +
        '<div class="vcde-progress__label">' +
          done + " von " + total + " Leveln abgeschlossen (" + pct + " %) " +
          '<button type="button" class="vcde-reset" data-vcde-reset>Fortschritt zurücksetzen</button>' +
        "</div>" +
      "</div>";

    var resetBtn = el.querySelector("[data-vcde-reset]");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        resetProgress();
        renderProgress(el);
        // Falls auf der gleichen Seite eine Landkarte existiert, neu zeichnen.
        var map = document.querySelector("[data-vcde-map]");
        if (map) renderMap(map);
      });
    }
  }

  // ---- Rendering: Maskottchen ----------------------------------------------
  // Standard-Maskottchen: "Lumi", ein Lichtstrahl-Guide.
  var DEFAULT_MASCOT = {
    name: "Lumi",
    img: "assets/mascot/guide.png",
    emoji: "💡"
  };

  function mascotHTML(opts) {
    opts = opts || {};
    var name = opts.name || DEFAULT_MASCOT.name;
    var emoji = opts.emoji || DEFAULT_MASCOT.emoji;
    var img = opts.img === undefined ? DEFAULT_MASCOT.img : opts.img;
    var text = opts.text || "";

    var prefix = pathPrefix();
    // Bild mit Fallback: kann das Bild nicht geladen werden, bleibt das Emoji
    // sichtbar (onerror entfernt das <img>).
    var avatarInner = emoji;
    if (img) {
      avatarInner =
        '<img src="' + prefix + img + '" alt="' + escapeHTML(name) + '" ' +
        'onerror="this.remove()" />';
    }

    return (
      '<div class="vcde-mascot">' +
        '<div class="vcde-mascot__avatar" aria-hidden="true">' + avatarInner + "</div>" +
        '<div class="vcde-mascot__body">' +
          '<p class="vcde-mascot__name">' + escapeHTML(name) + "</p>" +
          '<div class="vcde-mascot__text">' + text + "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function mountMascot(target, opts) {
    var el = resolve(target);
    if (!el) return;
    el.innerHTML = mascotHTML(opts);
  }

  // ---- Rendering: Quiz ------------------------------------------------------
  function renderQuiz(target, config) {
    var el = resolve(target);
    if (!el || !config || !Array.isArray(config.questions)) return;

    var questions = config.questions;
    var passRatio = typeof config.passRatio === "number" ? config.passRatio : 0.7;
    var needed = Math.ceil(questions.length * passRatio);
    var groupPrefix = "vcdequiz-" + Math.random().toString(36).slice(2, 8);

    var html = '<div class="vcde-quiz">';
    html += '<h3 class="vcde-quiz__title">' + escapeHTML(config.title || "Abschluss-Quiz") + "</h3>";
    html +=
      '<p class="vcde-quiz__intro">' +
      escapeHTML(config.intro || ("Beantworte mindestens " + needed + " von " + questions.length + " Fragen richtig, um das Level abzuschließen.")) +
      "</p>";

    questions.forEach(function (q, qi) {
      html += '<div class="vcde-quiz__q" data-qi="' + qi + '" data-answer="' + q.answer + '">';
      html += '<p class="vcde-quiz__q-text">' + (qi + 1) + ". " + escapeHTML(q.q) + "</p>";
      (q.options || []).forEach(function (opt, oi) {
        var gid = groupPrefix + "-" + qi;
        html +=
          '<label class="vcde-quiz__opt" data-oi="' + oi + '">' +
            '<input type="radio" name="' + gid + '" value="' + oi + '">' +
            "<span>" + escapeHTML(opt) + "</span>" +
          "</label>";
      });
      if (q.explain) {
        html += '<p class="vcde-quiz__explain">' + escapeHTML(q.explain) + "</p>";
      }
      html += "</div>";
    });

    html +=
      '<div class="vcde-quiz__actions">' +
        '<button type="button" class="vcde-btn" data-quiz-check>Auswerten</button>' +
        '<button type="button" class="vcde-btn vcde-btn--ghost" data-quiz-retry>Erneut versuchen</button>' +
      "</div>";
    html += '<div class="vcde-quiz__result" role="status"></div>';
    html += "</div>";

    el.innerHTML = html;

    var root = el.querySelector(".vcde-quiz");
    var checkBtn = root.querySelector("[data-quiz-check]");
    var retryBtn = root.querySelector("[data-quiz-retry]");
    var resultBox = root.querySelector(".vcde-quiz__result");
    var qNodes = root.querySelectorAll(".vcde-quiz__q");

    function evaluate() {
      var correct = 0;
      var answeredAll = true;

      qNodes.forEach(function (qn) {
        var answer = parseInt(qn.getAttribute("data-answer"), 10);
        var selected = qn.querySelector("input:checked");
        qn.classList.add("vcde-quiz__q--checked");

        // Optik der Optionen zurücksetzen
        qn.querySelectorAll(".vcde-quiz__opt").forEach(function (opt) {
          opt.classList.remove("vcde-quiz__opt--correct", "vcde-quiz__opt--wrong");
        });

        var opts = qn.querySelectorAll(".vcde-quiz__opt");
        if (opts[answer]) opts[answer].classList.add("vcde-quiz__opt--correct");

        if (!selected) {
          answeredAll = false;
          return;
        }
        var chosen = parseInt(selected.value, 10);
        if (chosen === answer) {
          correct++;
        } else if (opts[chosen]) {
          opts[chosen].classList.add("vcde-quiz__opt--wrong");
        }
      });

      var passed = answeredAll && correct >= needed;
      resultBox.classList.add("vcde-quiz__result--show");
      resultBox.classList.remove("vcde-quiz__result--pass", "vcde-quiz__result--fail");

      if (!answeredAll) {
        resultBox.classList.add("vcde-quiz__result--fail");
        resultBox.innerHTML = "Bitte beantworte alle Fragen. (" + correct + "/" + questions.length + " richtig)";
        return;
      }

      if (passed) {
        resultBox.classList.add("vcde-quiz__result--pass");
        var next = config.levelId ? markComplete(config.levelId) : null;
        var msg =
          "🎉 Geschafft! " + correct + "/" + questions.length +
          " richtig. Level abgeschlossen.";
        if (next) {
          var prefix = pathPrefix();
          msg +=
            '<br><a class="vcde-quiz__next" href="' + prefix + next.href + '">' +
            "Weiter zu „" + escapeHTML(next.title) + "“ →</a>";
        } else {
          msg += '<br><a class="vcde-quiz__next" href="' + pathPrefix() + 'index.html">Zurück zur Landkarte →</a>';
        }
        resultBox.innerHTML = msg;
        checkBtn.disabled = true;
      } else {
        resultBox.classList.add("vcde-quiz__result--fail");
        resultBox.innerHTML =
          "Noch nicht ganz: " + correct + "/" + questions.length +
          " richtig (nötig: " + needed + "). Schau dir die Lösungen an und versuch es erneut.";
      }
    }

    function reset() {
      qNodes.forEach(function (qn) {
        qn.classList.remove("vcde-quiz__q--checked");
        qn.querySelectorAll(".vcde-quiz__opt").forEach(function (opt) {
          opt.classList.remove("vcde-quiz__opt--correct", "vcde-quiz__opt--wrong");
        });
        qn.querySelectorAll("input").forEach(function (inp) { inp.checked = false; });
      });
      resultBox.classList.remove("vcde-quiz__result--show", "vcde-quiz__result--pass", "vcde-quiz__result--fail");
      resultBox.innerHTML = "";
      checkBtn.disabled = false;
    }

    checkBtn.addEventListener("click", evaluate);
    retryBtn.addEventListener("click", reset);
  }

  // ---- Abschluss-Button (für Level ohne eigenes Quiz) ----------------------
  // Leichtgewichtige Alternative zum Quiz: markiert ein Level direkt als
  // abgeschlossen und verlinkt das nächste. Nützlich für die bereits
  // bestehenden Demo-Level (Ray/Path Tracing), bis sie ein eigenes Quiz
  // bekommen.
  function renderComplete(target, levelId) {
    var el = resolve(target);
    if (!el) return;

    function paint() {
      var done = isCompleted(levelId);
      var next = getNextLevel(levelId);
      var prefix = pathPrefix();
      var html = '<div class="vcde-quiz">';

      if (done) {
        html += '<div class="vcde-quiz__result vcde-quiz__result--show vcde-quiz__result--pass">';
        html += "✓ Dieses Level ist abgeschlossen.";
        if (next) {
          html += '<br><a class="vcde-quiz__next" href="' + prefix + next.href + '">Weiter zu „' + escapeHTML(next.title) + "“ →</a>";
        } else {
          html += '<br><a class="vcde-quiz__next" href="' + prefix + 'index.html">Zurück zur Landkarte →</a>';
        }
        html += "</div>";
        html += '<div class="vcde-quiz__actions" style="margin-top:0.8rem">';
        html += '<button type="button" class="vcde-btn vcde-btn--ghost" data-complete-undo>Wieder als offen markieren</button>';
        html += "</div>";
      } else {
        html += '<p class="vcde-quiz__intro">Hast du dieses Level durchgearbeitet? Dann markiere es als abgeschlossen, um das nächste freizuschalten.</p>';
        html += '<div class="vcde-quiz__actions">';
        html += '<button type="button" class="vcde-btn" data-complete-do>Level abschließen ✓</button>';
        html += "</div>";
      }

      html += "</div>";
      el.innerHTML = html;

      var doBtn = el.querySelector("[data-complete-do]");
      if (doBtn) {
        doBtn.addEventListener("click", function () {
          markComplete(levelId);
          paint();
        });
      }
      var undoBtn = el.querySelector("[data-complete-undo]");
      if (undoBtn) {
        undoBtn.addEventListener("click", function () {
          var progress = readProgress();
          var i = progress.completed.indexOf(levelId);
          if (i !== -1) {
            progress.completed.splice(i, 1);
            writeProgress(progress);
          }
          paint();
        });
      }
    }

    paint();
  }

  // ---- Level-Statusleiste (oben auf Level-Seiten) --------------------------
  function renderLevelBar(target, levelId) {
    var el = resolve(target);
    if (!el) return;
    var lvl = getLevel(levelId);
    var idx = levelIndex(levelId);
    var prefix = pathPrefix();
    var status = isCompleted(levelId)
      ? '<span class="vcde-badge vcde-badge--completed">✓ Abgeschlossen</span>'
      : '<span class="vcde-badge vcde-badge--open">In Arbeit</span>';

    el.innerHTML =
      '<div class="vcde-levelbar">' +
        '<a class="vcde-levelbar__home" href="' + prefix + 'index.html">🗺️ Landkarte</a>' +
        '<span class="vcde-levelbar__sep">›</span>' +
        "<span>Level " + (idx + 1) + (lvl ? ": " + escapeHTML(lvl.title) : "") + "</span>" +
        status +
      "</div>";
  }

  // ---- Deklaratives Auto-Init ----------------------------------------------
  // Seiten benutzen Markup statt Inline-JS, weil dieses Skript erst am Ende
  // des Body geladen wird.
  function autoInit() {
    // Landkarte
    document.querySelectorAll("[data-vcde-map]").forEach(function (el) {
      renderMap(el);
    });

    // Fortschrittsbalken
    document.querySelectorAll("[data-vcde-progress]").forEach(function (el) {
      renderProgress(el);
    });

    // Maskottchen: Text steht im Element, Name optional via data-name
    document.querySelectorAll("[data-vcde-mascot]").forEach(function (el) {
      var opts = {
        name: el.getAttribute("data-name") || undefined,
        text: el.innerHTML.trim()
      };
      mountMascot(el, opts);
    });

    // Level-Statusleiste
    document.querySelectorAll("[data-vcde-levelbar]").forEach(function (el) {
      renderLevelBar(el, el.getAttribute("data-vcde-levelbar"));
    });

    // Abschluss-Button (Level ohne Quiz)
    document.querySelectorAll("[data-vcde-complete]").forEach(function (el) {
      renderComplete(el, el.getAttribute("data-vcde-complete"));
    });

    // Quiz: Konfiguration als JSON in einem <script type="application/json">
    document.querySelectorAll("[data-vcde-quiz]").forEach(function (el) {
      var cfgNode = el.querySelector('script[type="application/json"]');
      if (!cfgNode) return;
      var config;
      try {
        config = JSON.parse(cfgNode.textContent);
      } catch (e) {
        return;
      }
      // Container für das gerenderte Quiz (Config-Skript bleibt unsichtbar).
      var mount = document.createElement("div");
      el.appendChild(mount);
      renderQuiz(mount, config);
    });
  }

  // ---- Export ---------------------------------------------------------------
  window.VCDE = {
    getLevels: getLevels,
    getLevel: getLevel,
    getNextLevel: getNextLevel,
    getProgress: getProgress,
    isCompleted: isCompleted,
    isUnlocked: isUnlocked,
    completedCount: completedCount,
    markComplete: markComplete,
    resetProgress: resetProgress,
    renderMap: renderMap,
    renderProgress: renderProgress,
    renderQuiz: renderQuiz,
    renderLevelBar: renderLevelBar,
    renderComplete: renderComplete,
    mascotHTML: mascotHTML,
    mountMascot: mountMascot
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }
})();
