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
  var left = ds.position === "bottom-left";
  var showLauncher = ds.launcher !== "false";
  var accent = /^#[0-9a-f]{3,8}$/i.test(ds.accent || "") ? ds.accent : null;
  var seenKey = "openheard:changelog-seen:" + origin + (ws ? "/" + ws : "");
  var latest = 0;
  var isOpen = false;
  var frame = null;
  var ready = false;
  var queuedTab = null;
  // Opening on page load must not pull focus away from the host page.
  var focusOnReady = true;
  // While a post is sending, Esc and outside clicks leave the panel open.
  var busy = false;

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

  var CHAT = '<svg viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24ZM84,140a12,12,0,1,1,12-12A12,12,0,0,1,84,140Zm44,0a12,12,0,1,1,12-12A12,12,0,0,1,128,140Zm44,0a12,12,0,1,1,12-12A12,12,0,0,1,172,140Z"/></svg>';
  var CLOSE = '<svg viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M208.49,191.51a12,12,0,0,1-17,17L128,145,64.49,208.49a12,12,0,0,1-17-17L111,128,47.51,64.49a12,12,0,0,1,17-17L128,111l63.51-63.52a12,12,0,0,1,17,17L145,128Z"/></svg>';
  var side = left ? "left" : "right";

  var css =
    ":host{all:initial}" +
    "*{box-sizing:border-box}" +
    ".l{position:fixed;bottom:20px;" + side + ":20px;z-index:2147483001;width:52px;height:52px;padding:0;border:0;border-radius:999px;cursor:pointer;" +
    "background:var(--a);color:#0d0d0f;display:grid;place-items:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 6px 20px rgba(0,0,0,.24);" +
    "transition:transform .15s ease-out;-webkit-tap-highlight-color:transparent}" +
    ".l:hover{transform:translateY(-1px)}.l:active{transform:scale(.96)}" +
    ".l:focus-visible{outline:2px solid var(--a);outline-offset:3px}" +
    ".l svg{grid-area:1/1;width:24px;height:24px;transition:opacity .2s ease-out,transform .4s cubic-bezier(.34,1.25,.64,1)}" +
    ".l .x{width:20px;height:20px;opacity:0;transform:rotate(45deg)}" +
    ".o .l{background:#161618;color:#ededf0;box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 0 0 1px rgba(255,255,255,.08),0 6px 20px rgba(0,0,0,.28)}" +
    ".o .l .c{opacity:0;transform:rotate(-45deg) scale(.8)}.o .l .x{opacity:1;transform:none}" +
    ".b{position:absolute;top:-3px;" + side + ":-5px;height:18px;padding:0 6px;border-radius:999px;background:#0d0d0f;color:#ededf0;" +
    "font:600 11px/18px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em;box-shadow:0 0 0 2px var(--a);display:none}" +
    ".n .b{display:block}.o .b{display:none}" +
    // One shell: the panel grows out of the launcher's centre and shrinks back into it.
    ".p{position:fixed;bottom:84px;" + side + ":20px;z-index:2147483000;width:400px;height:min(628px,calc(100vh - 108px));border-radius:200px;overflow:hidden;" +
    "background:#0d0d0f;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 16px 48px rgba(0,0,0,.36);opacity:0;visibility:hidden;pointer-events:none;" +
    "transform:scale(.13);transform-origin:" + (left ? "26px" : "calc(100% - 26px)") + " calc(100% + 38px);" +
    "transition:transform .28s cubic-bezier(.22,1,.36,1),border-radius .28s cubic-bezier(.22,1,.36,1),opacity .2s ease-in .08s,visibility 0s linear .28s}" +
    ".o .p{opacity:1;visibility:visible;pointer-events:auto;transform:none;border-radius:14px;" +
    "transition:transform .4s cubic-bezier(.34,1.25,.64,1),border-radius .4s cubic-bezier(.34,1.25,.64,1),opacity .12s ease-out,visibility 0s}" +
    ".nl .p{bottom:20px;transform-origin:" + (left ? "0" : "100%") + " 100%}" +
    "iframe{display:block;width:100%;height:100%;border:0;background:#0d0d0f;color-scheme:dark}" +
    "@media (max-width:480px){.p,.o .p{inset:0;width:auto;height:auto;border-radius:0}.o .l{display:none}}" +
    "@media (prefers-reduced-motion:reduce){.l,.l svg{transition:none}.p,.o .p{transform:none;border-radius:14px;transition:opacity .15s linear,visibility 0s linear .15s}.o .p{transition:opacity .15s linear}}";

  var host = d.createElement("div");
  host.setAttribute("data-openheard-widget", "");
  var root = host.attachShadow ? host.attachShadow({ mode: "closed" }) : host;
  var wrap = d.createElement("div");
  wrap.style.setProperty("--a", accent || "#6e8bff");
  if (!showLauncher) wrap.className = "nl";
  var style = d.createElement("style");
  style.textContent = css;
  var panel = d.createElement("div");
  panel.className = "p";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Feedback");
  var launcher = d.createElement("button");
  launcher.type = "button";
  launcher.className = "l";
  launcher.setAttribute("aria-label", "Open feedback");
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML = CHAT.replace("<svg", '<svg class="c"') + CLOSE.replace("<svg", '<svg class="x"') + '<span class="b">new</span>';
  wrap.appendChild(style);
  wrap.appendChild(panel);
  if (showLauncher) wrap.appendChild(launcher);
  root.appendChild(wrap);

  function badge() {
    // Never opened: only news from the last 30 days counts as new.
    var last = seen();
    var on = latest > 0 && (last ? latest > last : Date.now() - latest < 2592e6);
    wrap.classList.toggle("n", on);
    launcher.setAttribute("aria-label", on ? "Open feedback, new updates" : isOpen ? "Close feedback" : "Open feedback");
  }

  function ensureFrame(tab) {
    if (frame) return;
    frame = d.createElement("iframe");
    frame.title = "Feedback";
    frame.setAttribute("allow", "clipboard-write");
    var params = { tab: tab || "feedback", seen: String(seen()) };
    if (accent) params.accent = accent;
    frame.src = origin + "/widget" + query(params);
    panel.appendChild(frame);
  }

  function post(msg) {
    if (frame && frame.contentWindow && ready) frame.contentWindow.postMessage(msg, origin);
  }

  function setOpen(next, tab) {
    if (next) ensureFrame(tab);
    if (next && tab) {
      if (ready) post({ type: "openheard:open", tab: tab });
      else queuedTab = tab;
    }
    if (next === isOpen) return;
    isOpen = next;
    wrap.classList.toggle("o", isOpen);
    launcher.setAttribute("aria-expanded", String(isOpen));
    badge();
    if (isOpen) {
      post({ type: "openheard:open", fresh: true });
      if (frame && ready) frame.focus({ preventScroll: true });
    } else if (d.activeElement === host) {
      launcher.focus();
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
      if (isOpen) post({ type: "openheard:open", tab: queuedTab || undefined, fresh: true });
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

  function api(cmd, arg) {
    if (cmd === "open") setOpen(true, arg);
    else if (cmd === "close") setOpen(false);
    else if (cmd === "toggle") setOpen(!isOpen, arg);
  }
  var queue = (w.openheard && w.openheard.q) || [];
  w.openheard = api;
  for (var i = 0; i < queue.length; i++) api.apply(null, queue[i]);

  function mount() {
    d.body.appendChild(host);
    fetch(origin + "/widget.json" + query())
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (meta) {
        if (!meta) return;
        if (!accent && meta.accent) wrap.style.setProperty("--a", meta.accent);
        latest = meta.changelog ? Number(meta.latestChangelogAt) || 0 : 0;
        badge();
      })
      .catch(function () {});
    if (ds.openOnLoad != null && ds.openOnLoad !== "false") {
      focusOnReady = false;
      setOpen(true);
    }
  }

  if (d.body) mount();
  else d.addEventListener("DOMContentLoaded", mount);
})();
