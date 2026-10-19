/* Fournisseur — logique du site (vanilla, sans dépendance) */
(function () {
  "use strict";

  var PAGE = 48;          // articles ajoutés par « Afficher plus »

  var state = {
    all: [],
    meta: null,
    view: "recent",
    q: "",
    cat: "",
    brand: "",
    shown: PAGE,
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Utilitaires ---------- */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function price(p) {
    if (p.price == null || p.price === 0) return "—";
    var sym = p.currency || "$";
    // La devise renvoyée par l'API est déjà un symbole ("$") : on ne le double pas.
    var val = Number(p.price).toLocaleString("fr-FR");
    return /^[A-Za-z]{2,3}$/.test(sym) ? sym + " " + val : sym + val;
  }

  function shortDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  }

  function fullDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d)) return "—";
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  }

  /**
   * Catégorie devinée depuis le nom de l'article.
   * L'API ne fournit pas de catégorie exploitable sur la liste : on la déduit,
   * comme le faisait déjà le scraper du projet YoFournisseur.
   */
  var CATS = [
    [/HOODIE|SWEATSHIRT|CREWNECK|ZIP\s*UP|SWEAT/i, "Hoodie / Sweat"],
    [/JACKET|COAT|BOMBER|PUFFER|VARSITY|WINDBREAKER|SHELL|TRACK\s*TOP/i, "Veste / Manteau"],
    [/T-?SHIRT|TEE|SHIRT/i, "T-shirt / Chemise"],
    [/PANT|JEANS|CARGO|TROUSER|JOGGER|LEGGING|CHINO|SHORT/i, "Pantalon / Short"],
    [/CAP|HAT|BEANIE|BUCKET|SNAPBACK|VISOR/i, "Casquette"],
    [/SHOE|SNEAKER|TRAINER|BOOT|SLIDE|SANDAL|LOAFER/i, "Chaussures"],
    [/BAG|BACKPACK|DUFFLE|TOTE|CROSSBODY|WAIST/i, "Sac"],
    [/VEST|GILET|WAISTCOAT/i, "Gilet"],
    [/DRESS|SKIRT/i, "Robe / Jupe"],
    [/POLO/i, "Polo"],
    [/FLEECE/i, "Polaire"],
    [/SOCK/i, "Chaussettes"],
    [/WATCH|RELOJ|MONTRE/i, "Montre"],
    [/PERFUME|PARFUM|FRAGRANCE/i, "Parfum"],
  ];

  function categoryOf(name) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i][0].test(name)) return CATS[i][1];
    return "Autre";
  }

  /** Marque devinée depuis le nom (premier mot significatif). */
  var BRAND_STOP = /^(THE|NEW|MEN|WOMEN|KIDS|UNISEX|\d+)$/i;

  function brandOf(name) {
    var parts = String(name).replace(/[×x]/g, " ").split(/\s+/).filter(Boolean);
    for (var i = 0; i < parts.length; i++) {
      var w = parts[i].replace(/[^A-Za-z.'&-]/g, "");
      if (w.length >= 2 && !BRAND_STOP.test(w)) return w.toUpperCase();
    }
    return "Autre";
  }

  /* ---------- Chargement ---------- */

  fetch("data/products.json", { cache: "no-store" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      state.meta = data.meta || {};
      state.all = (data.products || []).map(function (p) {
        p._cat = categoryOf(p.name);
        p._brand = brandOf(p.name);
        return p;
      });
      boot();
    })
    .catch(function (err) {
      $("meta").textContent = "Impossible de charger les données (" + err.message + ").";
      $("grid").innerHTML =
        '<p style="color:var(--ink-3);padding:40px 0">Les données ne sont pas encore disponibles. ' +
        "Le site se remplira après la première collecte.</p>";
    });

  function boot() {
    applyTheme(store.get("f-theme") || "auto");
    buildFilters();
    updateCounts();
    renderMeta();
    bind();
    render();
  }

  /* localStorage peut être indisponible (navigation privée, cookies bloqués) */
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  /* ---------- Thème ---------- */

  function prefersDark() {
    try {
      return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    } catch (e) {
      return false;
    }
  }

  function applyTheme(mode) {
    var dark = mode === "dark" || (mode === "auto" && prefersDark());
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    $("theme").textContent = dark ? "☀️" : "🌙";
    store.set("f-theme", mode);
  }

  /* ---------- Filtres ---------- */

  function buildFilters() {
    var cats = {}, brands = {};
    state.all.forEach(function (p) {
      cats[p._cat] = (cats[p._cat] || 0) + 1;
      brands[p._brand] = (brands[p._brand] || 0) + 1;
    });

    fill($("f-cat"), cats, "Toutes les catégories");
    // On n'affiche que les marques ayant au moins 2 articles (sinon la liste est ingérable)
    var keep = {};
    Object.keys(brands).forEach(function (b) { if (brands[b] >= 2) keep[b] = brands[b]; });
    fill($("f-brand"), keep, "Toutes les marques");
  }

  function fill(sel, map, label) {
    var keys = Object.keys(map).sort(function (a, b) {
      return map[b] - map[a] || a.localeCompare(b);
    });
    sel.innerHTML = '<option value="">' + esc(label) + "</option>" +
      keys.map(function (k) {
        return '<option value="' + esc(k) + '">' + esc(k) + " (" + map[k] + ")</option>";
      }).join("");
  }

  function updateCounts() {
    $("c-recent").textContent = state.all.filter(function (p) { return p.recent; }).length;
    $("c-top").textContent = state.all.filter(function (p) { return p.top; }).length;
    $("c-all").textContent = state.all.length;
  }

  function renderMeta() {
    var m = state.meta || {};
    var d = m.updatedAt ? new Date(m.updatedAt) : null;
    var when = d && !isNaN(d)
      ? d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) +
        " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
      : "date inconnue";
    $("meta").innerHTML =
      esc(m.total || state.all.length) + " articles suivis &middot; dernière mise à jour : <strong>" +
      esc(when) + "</strong>" +
      (m.latestAt ? " &middot; dernier article publié le " + esc(fullDate(m.latestAt)) : "");
  }

  /* ---------- Sélection et rendu ---------- */

  function selected() {
    var q = state.q.toLowerCase();
    return state.all.filter(function (p) {
      if (state.view === "recent" && !p.recent) return false;
      if (state.view === "top" && !p.top) return false;
      if (state.cat && p._cat !== state.cat) return false;
      if (state.brand && p._brand !== state.brand) return false;
      if (q && p.name.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function card(p) {
    var badges = "";
    if (p.recent) badges += '<span class="badge">Nouveau</span>';
    if (p.top) badges += '<span class="badge top">★ Top</span>';
    var n = p.imageCount || (p.images ? p.images.length : 0);
    var img = p.cover || (p.images && p.images[0]) || "";

    return '<article class="card" tabindex="0" data-id="' + p.id + '">' +
      '<div class="thumb">' + badges +
        (n > 1 ? '<span class="imgs">' + n + " photos</span>" : "") +
        (img ? '<img loading="lazy" decoding="async" src="' + esc(img) + '" alt="' + esc(p.name) + '">' : "") +
      "</div>" +
      '<div class="card-b">' +
        '<h3 class="card-n">' + esc(p.name || "Sans nom") + "</h3>" +
        '<div class="card-m">' +
          '<span class="card-p">' + esc(price(p)) + "</span>" +
          '<span class="card-d">' + esc(shortDate(p.createdAt)) + "</span>" +
        "</div>" +
      "</div></article>";
  }

  function render() {
    var list = selected();
    var grid = $("grid");

    $("count").textContent = list.length
      ? list.length + (list.length > 1 ? " articles" : " article") +
        (state.view === "recent" ? " récents" : state.view === "top" ? " mis en avant" : "")
      : "";

    var slice = list.slice(0, state.shown);
    grid.innerHTML = slice.map(card).join("");

    $("empty").hidden = list.length > 0;
    $("more-wrap").hidden = list.length <= state.shown;

    // Fondu des images au chargement
    Array.prototype.forEach.call(grid.querySelectorAll(".thumb img"), function (im) {
      if (im.complete && im.naturalWidth) im.classList.add("on");
      else {
        im.addEventListener("load", function () { im.classList.add("on"); });
        im.addEventListener("error", function () {
          im.style.display = "none";
          var t = im.parentNode;
          if (t && !t.querySelector(".noimg")) {
            var s = document.createElement("div");
            s.className = "noimg";
            s.style.cssText = "display:grid;place-items:center;height:100%;color:var(--ink-3);font-size:26px";
            s.textContent = "🖼️";
            t.appendChild(s);
          }
        });
      }
    });
  }

  /* ---------- Fiche produit ---------- */

  function openModal(id) {
    var p = null;
    for (var i = 0; i < state.all.length; i++) if (state.all[i].id === id) { p = state.all[i]; break; }
    if (!p) return;

    var imgs = (p.images && p.images.length) ? p.images : (p.cover ? [p.cover] : []);

    $("m-title").textContent = p.name || "Sans nom";
    $("m-price").textContent = price(p);

    var main = $("m-img");
    main.src = imgs[0] || "";
    main.alt = p.name || "";

    $("m-thumbs").innerHTML = imgs.map(function (src, i) {
      return '<img src="' + esc(src) + '" data-i="' + i + '" class="' + (i === 0 ? "on" : "") +
        '" alt="Photo ' + (i + 1) + '" loading="lazy">';
    }).join("");

    $("m-facts").innerHTML =
      "<dt>Catégorie</dt><dd>" + esc(p._cat) + "</dd>" +
      "<dt>Marque</dt><dd>" + esc(p._brand) + "</dd>" +
      "<dt>Publié le</dt><dd>" + esc(fullDate(p.createdAt)) + "</dd>" +
      "<dt>Photos</dt><dd>" + esc(p.imageCount || imgs.length) + "</dd>" +
      "<dt>Référence</dt><dd>#" + esc(p.id) + "</dd>";

    $("modal").hidden = false;
    document.body.style.overflow = "hidden";
    $("modal").querySelector(".modal-x").focus();
  }

  function closeModal() {
    $("modal").hidden = true;
    document.body.style.overflow = "";
  }

  /* ---------- Événements ---------- */

  function bind() {
    $("theme").addEventListener("click", function () {
      var cur = store.get("f-theme") || "auto";
      applyTheme(cur === "dark" ? "light" : "dark");
    });

    document.querySelectorAll(".tab").forEach(function (t) {
      t.addEventListener("click", function () {
        document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("is-on"); });
        t.classList.add("is-on");
        state.view = t.dataset.view;
        state.shown = PAGE;
        render();
      });
    });

    var timer = null;
    $("q").addEventListener("input", function (e) {
      clearTimeout(timer);
      var v = e.target.value;
      timer = setTimeout(function () {
        state.q = v.trim();
        state.shown = PAGE;
        render();
      }, 140);
    });

    $("f-cat").addEventListener("change", function (e) {
      state.cat = e.target.value; state.shown = PAGE; render();
    });
    $("f-brand").addEventListener("change", function (e) {
      state.brand = e.target.value; state.shown = PAGE; render();
    });

    function reset() {
      state.q = ""; state.cat = ""; state.brand = ""; state.shown = PAGE;
      $("q").value = ""; $("f-cat").value = ""; $("f-brand").value = "";
      render();
    }
    $("reset").addEventListener("click", reset);
    $("clear").addEventListener("click", reset);

    $("more").addEventListener("click", function () {
      state.shown += PAGE;
      render();
    });

    // Ouverture d'une fiche (clic ou clavier)
    $("grid").addEventListener("click", function (e) {
      var c = e.target.closest(".card");
      if (c) openModal(Number(c.dataset.id));
    });
    $("grid").addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var c = e.target.closest(".card");
      if (c) { e.preventDefault(); openModal(Number(c.dataset.id)); }
    });

    // Galerie
    $("m-thumbs").addEventListener("click", function (e) {
      var t = e.target.closest("img");
      if (!t) return;
      $("m-img").src = t.src;
      $("m-thumbs").querySelectorAll("img").forEach(function (x) { x.classList.remove("on"); });
      t.classList.add("on");
    });

    // Fermeture
    $("modal").addEventListener("click", function (e) {
      if (e.target.hasAttribute("data-close")) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !$("modal").hidden) closeModal();
    });
  }
})();
