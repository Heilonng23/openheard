/* openheard widget loader. Served as /widget.js; see docs/widget.md.
   Plain ES5-ish on purpose: it runs on pages we do not control. */
(function () {
  var w = window;
  var d = document;
  if (w.__openheardWidget) return;
  w.__openheardWidget = true;

  var script = d.currentScript || d.querySelector('script[src*="/widget.js"]');
  if (!script) return;
  var src = new URL(script.src, location.href);
  var origin = src.origin;
  var ds = script.dataset;
  // Local dev picks a workspace with ?ws=; the cloud reads the subdomain.
  var ws = src.searchParams.get("ws");
  var HEX = /^#[0-9a-f]{3,8}$/i;
  // Appearance, in rising priority: defaults, the workspace's saved settings
  // from /widget.json, data-* attributes, then window.openheard("config", {...}).
  var saved = {};
  var attrs = {
    theme: ds.theme,
    accent: ds.accent,
    launcher: ds.launcher === "false" ? "hidden" : ds.launcher === "true" ? "icon" : ds.launcher,
    label: ds.label,
    icon: ds.icon,
    position: ds.position,
    radius: ds.radius,
    tabs: ds.tabs,
  };
  var live = {};
  var VALID = {
    theme: /^(dark|light|auto)$/,
    accent: HEX,
    launcher: /^(icon|label|hidden)$/,
    icon: /^(chat|lightbulb|megaphone|question|sparkle)$/,
    position: /^bottom-(left|right)$/,
    radius: /^(sharp|soft|round)$/,
    label: /^[^]{1,24}$/,
    tabs: /^((feedback|roadmap|changelog),?)+$/,
  };
  var DEFAULTS = { theme: "dark", launcher: "icon", label: "Feedback", icon: "chat", position: "bottom-right", radius: "soft", tabs: "" };
  var cfg = {};
  var light = false;
  var dark = w.matchMedia ? w.matchMedia("(prefers-color-scheme: dark)") : null;
  var seenKey = "openheard:changelog-seen:" + origin + (ws ? "/" + ws : "");
  var latest = 0;
  var isOpen = false;
  var frame = null;
  var ready = false;
  var queuedTab = null;
  var frameTab = null;
  // Opening on page load must not pull focus away from the host page.
  var focusOnReady = true;
  // While a post is sending, Esc and outside clicks leave the panel open.
  var busy = false;
  // What had focus before the panel opened, for when there is no launcher to return to.
  var opener = null;

  function seen() {
    try {
      return Number(localStorage.getItem(seenKey)) || 0;
    } catch (e) {
      return 0;
    }
  }

  function query(extra) {
    var p = new URLSearchParams(extra || {});
    if (ws) p.set("ws", ws);
    var s = p.toString();
    return s ? "?" + s : "";
  }

  // Phosphor, bold weight.
  function svg(cls, path) {
    return '<svg class="' + cls + '" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="' + path + '"/></svg>';
  }
  var ICONS = {
    chat: "M120,128a16,16,0,1,1-16-16A16,16,0,0,1,120,128Zm32-16a16,16,0,1,0,16,16A16,16,0,0,0,152,112Zm84,16A108,108,0,0,1,78.77,224.15L46.34,235A20,20,0,0,1,21,209.66l10.81-32.43A108,108,0,1,1,236,128Zm-24,0A84,84,0,1,0,55.27,170.06a12,12,0,0,1,1,9.81l-9.93,29.79,29.79-9.93a12.1,12.1,0,0,1,3.8-.62,12,12,0,0,1,6,1.62A84,84,0,0,0,212,128Z",
    lightbulb: "M180,232a12,12,0,0,1-12,12H88a12,12,0,0,1,0-24h80A12,12,0,0,1,180,232Zm40-128a91.51,91.51,0,0,1-35.17,72.35A12.26,12.26,0,0,0,180,186v2a20,20,0,0,1-20,20H96a20,20,0,0,1-20-20v-2a12,12,0,0,0-4.7-9.51A91.57,91.57,0,0,1,36,104.52C35.73,54.69,76,13.2,125.79,12A92,92,0,0,1,220,104Zm-24,0a68,68,0,0,0-69.65-68C89.56,36.88,59.8,67.55,60,104.38a67.71,67.71,0,0,0,26.1,53.19A35.87,35.87,0,0,1,100,184h56.1A36.13,36.13,0,0,1,170,157.49,67.68,67.68,0,0,0,196,104Zm-20.07-5.32a48.5,48.5,0,0,0-31.91-40,12,12,0,0,0-8,22.62,24.31,24.31,0,0,1,16.09,20,12,12,0,0,0,23.86-2.64Z",
    megaphone: "M252,120a52.06,52.06,0,0,0-52-52H160.32c-3.44-.21-52.6-4-99.46-43.3A20,20,0,0,0,28,40V200a19.8,19.8,0,0,0,11.54,18.12,19.86,19.86,0,0,0,21.32-2.81A192.92,192.92,0,0,1,144,174.47v26.2a20,20,0,0,0,8.9,16.64,11.35,11.35,0,0,0,1.39.8l14.44,7.06A20,20,0,0,0,198.37,213l11.09-41.82A52.07,52.07,0,0,0,252,120ZM52,191.63V48.4c36.17,28.07,72.17,38.1,92,41.66V150C124.17,153.52,88.17,163.55,52,191.63ZM176.39,202.2,168,198.1V172h16.4ZM200,148H168V92h32a28,28,0,1,1,0,56Z",
    question: "M144,180a16,16,0,1,1-16-16A16,16,0,0,1,144,180Zm92-52A108,108,0,1,1,128,20,108.12,108.12,0,0,1,236,128Zm-24,0a84,84,0,1,0-84,84A84.09,84.09,0,0,0,212,128ZM128,64c-24.26,0-44,17.94-44,40v4a12,12,0,0,0,24,0v-4c0-8.82,9-16,20-16s20,7.18,20,16-9,16-20,16a12,12,0,0,0-12,12v8a12,12,0,0,0,23.73,2.56C158.31,137.88,172,122.37,172,104,172,81.94,152.26,64,128,64Z",
    sparkle: "M199,125.31l-49.88-18.39L130.69,57a19.92,19.92,0,0,0-37.38,0L74.92,106.92,25,125.31a19.92,19.92,0,0,0,0,37.38l49.88,18.39L93.31,231a19.92,19.92,0,0,0,37.38,0l18.39-49.88L199,162.69a19.92,19.92,0,0,0,0-37.38Zm-63.38,35.16a12,12,0,0,0-7.11,7.11L112,212.28l-16.47-44.7a12,12,0,0,0-7.11-7.11L43.72,144l44.7-16.47a12,12,0,0,0,7.11-7.11L112,75.72l16.47,44.7a12,12,0,0,0,7.11,7.11L180.28,144ZM140,40a12,12,0,0,1,12-12h12V16a12,12,0,0,1,24,0V28h12a12,12,0,0,1,0,24H188V64a12,12,0,0,1-24,0V52H152A12,12,0,0,1,140,40ZM252,88a12,12,0,0,1-12,12h-4v4a12,12,0,0,1-24,0v-4h-4a12,12,0,0,1,0-24h4V72a12,12,0,0,1,24,0v4h4A12,12,0,0,1,252,88Z",
  };
  var CLOSE = "M208.49,191.51a12,12,0,0,1-17,17L128,145,64.49,208.49a12,12,0,0,1-17-17L111,128,47.51,64.49a12,12,0,0,1,17-17L128,111l63.51-63.52a12,12,0,0,1,17,17L145,128Z";
  // Panel corner radius, and the launcher's (the icon button is a circle
  // unless the corners are sharp).
  var RADII = { sharp: [6, 12], soft: [14, 999], round: [22, 999] };

  var css =
    ":host{all:initial}" +
    "*{box-sizing:border-box}" +
    ".w .l{visibility:hidden}" +
    ".l{position:fixed;bottom:20px;right:20px;z-index:2147483001;width:var(--lh);height:var(--lh);padding:0;border:0;border-radius:var(--lr);cursor:pointer;" +
    "background:var(--a);color:var(--ai);display:grid;place-items:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 6px 20px rgba(0,0,0,.24);" +
    "font:600 14px/1 system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:-.01em;transition:transform .15s ease-out;-webkit-tap-highlight-color:transparent}" +
    ".lt .l{right:auto;left:20px}" +
    ".l:hover{transform:translateY(-1px)}.l:active{transform:scale(.96)}" +
    ".l:focus-visible{outline:2px solid var(--a);outline-offset:3px}" +
    ".l svg{grid-area:1/1;width:24px;height:24px;transition:opacity .2s ease-out,transform .4s cubic-bezier(.34,1.25,.64,1)}" +
    ".l .x{width:20px;height:20px;opacity:0;transform:rotate(45deg)}" +
    ".l .t{display:none}" +
    // Icon + label: a pill that turns into a round close button while open.
    ".pl .l{width:auto;display:flex;align-items:center;gap:8px;padding:0 18px 0 15px}" +
    ".pl .l svg{width:20px;height:20px}.pl .l .x{display:none}.pl .l .t{display:block}" +
    ".pl.o .l{width:var(--lh);padding:0;justify-content:center}.pl.o .l .c,.pl.o .l .t{display:none}.pl.o .l .x{display:block}" +
    ".nl .l{display:none}" +
    ".o .l{background:#161618;color:#ededf0;box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 0 0 1px rgba(255,255,255,.08),0 6px 20px rgba(0,0,0,.28)}" +
    ".lg.o .l{background:#fff;color:#141416;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 6px 20px rgba(0,0,0,.12)}" +
    ".o .l .c{opacity:0;transform:rotate(-45deg) scale(.8)}.o .l .x{opacity:1;transform:none}" +
    ".b{position:absolute;top:-3px;right:-5px;height:18px;padding:0 6px;border-radius:999px;background:#0d0d0f;color:#ededf0;" +
    "font:600 11px/18px system-ui,-apple-system,'Segoe UI',sans-serif;font-variant-numeric:tabular-nums;box-shadow:0 0 0 2px var(--a);display:none}" +
    ".lt .b{right:auto;left:-5px}" +
    ".n .b{display:block}.o .b{display:none}" +
    // One shell: the panel grows out of the launcher's centre and shrinks back into it.
    ".p{position:fixed;bottom:calc(var(--lh) + 32px);right:20px;z-index:2147483000;width:400px;height:min(628px,calc(100vh - var(--lh) - 56px));border-radius:var(--pc);overflow:hidden;" +
    "background:#0d0d0f;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 16px 48px rgba(0,0,0,.36);opacity:0;visibility:hidden;pointer-events:none;" +
    "transform:scale(.13);transform-origin:calc(100% - var(--lw,var(--lh)) / 2) calc(100% + 12px + var(--lh) / 2);" +
    "transition:transform .28s cubic-bezier(.22,1,.36,1),border-radius .28s cubic-bezier(.22,1,.36,1),opacity .2s ease-in .08s,visibility 0s linear .28s}" +
    ".lt .p{right:auto;left:20px;transform-origin:calc(var(--lw,var(--lh)) / 2) calc(100% + 12px + var(--lh) / 2)}" +
    ".lg .p{background:#f7f5f0;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 16px 48px rgba(0,0,0,.16)}" +
    ".o .p{opacity:1;visibility:visible;pointer-events:auto;transform:none;border-radius:var(--pr);" +
    "transition:transform .4s cubic-bezier(.34,1.25,.64,1),border-radius .4s cubic-bezier(.34,1.25,.64,1),opacity .12s ease-out,visibility 0s}" +
    ".nl .p{bottom:20px;transform-origin:100% 100%}.nl.lt .p{transform-origin:0 100%}" +
    "iframe{display:block;width:100%;height:100%;border:0;background:#0d0d0f;color-scheme:dark}" +
    ".lg iframe{background:#f7f5f0;color-scheme:light}" +
    "@media (max-width:480px){.p,.o .p{inset:0;width:auto;height:auto;border-radius:0}.o .l{display:none}}" +
    "@media (prefers-reduced-motion:reduce){.l,.l svg{transition:none}.p,.o .p{transform:none;border-radius:var(--pr);transition:opacity .15s linear,visibility 0s linear .15s}.o .p{transition:opacity .15s linear}}";

  var host = d.createElement("div");
  host.setAttribute("data-openheard-widget", "");
  var root = host.attachShadow ? host.attachShadow({ mode: "closed" }) : host;
  var wrap = d.createElement("div");
  // Hidden until the saved settings arrive, so it does not jump into shape.
  wrap.className = "w";
  var style = d.createElement("style");
  style.textContent = css;
  var panel = d.createElement("div");
  panel.className = "p";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Feedback");
  var launcher = d.createElement("button");
  launcher.type = "button";
  launcher.className = "l";
  launcher.setAttribute("aria-expanded", "false");
  var label = d.createElement("span");
  label.className = "t";
  var dot = d.createElement("span");
  dot.className = "b";
  dot.textContent = "new";
  wrap.appendChild(style);
  wrap.appendChild(panel);
  wrap.appendChild(launcher);
  root.appendChild(wrap);

  function pick(k) {
    var sources = [live, attrs, saved];
    for (var i = 0; i < 3; i++) {
      var v = sources[i][k];
      if (v && v.join) v = v.join(",");
      if (v != null && VALID[k].test(String(v))) return String(v);
    }
    return DEFAULTS[k] || null;
  }

  // Dark ink on light accents, white on dark ones.
  function ink(hex) {
    var h = hex.slice(1);
    if (h.length < 6) h = h.replace(/./g, "$&$&");
    var n = parseInt(h.slice(0, 6), 16);
    return (n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150 ? "#0d0d0f" : "#fff";
  }

  function frameConfig() {
    return { theme: light ? "light" : "dark", accent: cfg.accent, radius: cfg.radius, tabs: cfg.tabs };
  }

  function apply() {
    var old = cfg.icon;
    cfg = {};
    for (var k in VALID) cfg[k] = pick(k);
    cfg.accent = cfg.accent || saved.accent || "#6e8bff";
    light = cfg.theme === "light" || (cfg.theme === "auto" && !!dark && !dark.matches);
    var r = RADII[cfg.radius];
    var pill = cfg.launcher === "label";
    var s = wrap.style;
    s.setProperty("--a", cfg.accent);
    s.setProperty("--ai", ink(cfg.accent));
    s.setProperty("--lh", pill ? "44px" : "52px");
    s.setProperty("--lr", r[1] + "px");
    s.setProperty("--pr", r[0] + "px");
    s.setProperty("--pc", cfg.radius === "sharp" ? "90px" : "200px");
    wrap.classList.toggle("lt", cfg.position === "bottom-left");
    wrap.classList.toggle("lg", light);
    wrap.classList.toggle("nl", cfg.launcher === "hidden");
    wrap.classList.toggle("pl", pill);
    if (cfg.icon !== old) {
      launcher.innerHTML = svg("c", ICONS[cfg.icon]) + svg("x", CLOSE);
      launcher.appendChild(label);
      launcher.appendChild(dot);
    }
    label.textContent = cfg.label;
    badge();
    post({ type: "openheard:config", config: frameConfig() });
  }

  function badge() {
    // Never opened: only news from the last 30 days counts as new.
    var last = seen();
    var on = latest > 0 && (last ? latest > last : Date.now() - latest < 2592e6);
    wrap.classList.toggle("n", on);
    var name = cfg.launcher === "label" ? cfg.label : "feedback";
    launcher.setAttribute("aria-label", isOpen ? "Close " + name : on ? "Open " + name + ", new updates" : "Open " + name);
  }

  function ensureFrame(tab) {
    if (frame) return;
    frame = d.createElement("iframe");
    frame.title = "Feedback";
    frame.setAttribute("allow", "clipboard-write");
    var c = frameConfig();
    var params = { seen: String(seen()), theme: c.theme, accent: c.accent, radius: c.radius };
    if (tab) params.tab = frameTab = tab;
    if (c.tabs) params.tabs = c.tabs;
    frame.src = origin + "/widget" + query(params);
    panel.appendChild(frame);
  }

  function post(msg) {
    if (frame && frame.contentWindow && ready) frame.contentWindow.postMessage(msg, origin);
  }

  function setOpen(next, tab) {
    if (next) ensureFrame(tab);
    if (next && tab && ready) post({ type: "openheard:open", tab: tab });
    // Before the frame is ready only the latest open counts: a tab-less
    // reopen or a close drops a tab asked for earlier.
    if (!ready) queuedTab = (next && tab) || null;
    if (next === isOpen) return;
    // The panel grows from wherever the launcher's centre is, pill or circle.
    if (next && launcher.offsetWidth) wrap.style.setProperty("--lw", launcher.offsetWidth + "px");
    isOpen = next;
    wrap.classList.toggle("o", isOpen);
    launcher.setAttribute("aria-expanded", String(isOpen));
    badge();
    if (isOpen) {
      opener = d.activeElement !== host && d.activeElement !== d.body ? d.activeElement : null;
      post({ type: "openheard:open", fresh: true });
      if (frame && ready) frame.focus({ preventScroll: true });
    } else if (d.activeElement === host) {
      if (showLauncher) launcher.focus();
      else if (opener && opener.isConnected && opener.focus) opener.focus();
      else host.blur();
    }
  }

  launcher.addEventListener("click", function () {
    setOpen(!isOpen);
  });
  // Warm the iframe as soon as someone reaches for the button.
  launcher.addEventListener("pointerenter", function () {
    ensureFrame();
  });
  launcher.addEventListener("focus", function () {
    ensureFrame();
  });

  w.addEventListener("message", function (e) {
    if (e.origin !== origin || !frame || e.source !== frame.contentWindow) return;
    var m = e.data || {};
    if (m.type === "openheard:ready") {
      ready = true;
      post({ type: "openheard:config", config: frameConfig() });
      // A frame first loaded for a tab goes back to the first one when the
      // open that is showing asked for none.
      if (isOpen) post({ type: "openheard:open", tab: queuedTab || undefined, home: !queuedTab && !!frameTab, fresh: true });
      queuedTab = null;
      if (isOpen && focusOnReady) frame.focus({ preventScroll: true });
    } else if (m.type === "openheard:close") {
      setOpen(false);
    } else if (m.type === "openheard:busy") {
      busy = !!m.busy;
    } else if (m.type === "openheard:changelog-seen") {
      var at = Math.max(Number(m.at) || 0, latest);
      try {
        localStorage.setItem(seenKey, String(at || Date.now()));
      } catch (err) {
        /* storage blocked: the badge just clears for this page view */
        latest = 0;
      }
      badge();
    }
  });

  d.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen && !busy) setOpen(false);
  });

  // A click anywhere on the page outside the widget closes it.
  d.addEventListener("pointerdown", function (e) {
    var t = e.target;
    if (!isOpen || busy || t === host || (t && t.closest && t.closest("[data-openheard-open]"))) return;
    setOpen(false);
  });

  // Any element with data-openheard-open="feedback|roadmap|changelog" opens the widget.
  d.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-openheard-open]") : null;
    if (!t) return;
    e.preventDefault();
    setOpen(true, t.getAttribute("data-openheard-open") || undefined);
  });

  if (dark && dark.addEventListener) {
    dark.addEventListener("change", function () {
      if (cfg.theme === "auto") apply();
    });
  }

  function api(cmd, arg) {
    if (cmd === "open") setOpen(true, arg);
    else if (cmd === "close") setOpen(false);
    else if (cmd === "toggle") setOpen(!isOpen, arg);
    else if (cmd === "config" && arg) {
      live = arg;
      apply();
    }
  }
  apply();
  var queue = (w.openheard && w.openheard.q) || [];
  w.openheard = api;
  for (var i = 0; i < queue.length; i++) api.apply(null, queue[i]);

  function shown() {
    wrap.classList.remove("w");
  }

  function mount() {
    d.body.appendChild(host);
    fetch(origin + "/widget.json" + query())
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (meta) {
        if (!meta) return;
        saved = meta;
        latest = meta.changelog ? Number(meta.latestChangelogAt) || 0 : 0;
        apply();
      })
      .catch(function () {})
      .then(shown);
    if (ds.openOnLoad != null && ds.openOnLoad !== "false") {
      focusOnReady = false;
      setOpen(true);
    }
  }

  if (d.body) mount();
  else d.addEventListener("DOMContentLoaded", mount);
})();
