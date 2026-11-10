/* exercisesfortherecoveryofchildhood.com — the share button under each poem.
   On a phone or tablet it opens the device's own share menu with the
   exercise's image and link attached, so Instagram, TikTok, Facebook,
   Messages and email are all one tap away. On a computer it copies the link.
   It tells js/notes.js what happened (an "erc:share" event) so the private
   stats page can count shares; nothing else is sent anywhere. */
(function () {
  "use strict";

  var SITE = "https://exercisesfortherecoveryofchildhood.com/";
  var btn = document.getElementById("share");
  if (!btn) return;

  // Which exercise is on screen. Exercise pages carry it in the markup; the
  // home page writes its random pick there when it loads.
  function exercise() {
    var n = parseInt(document.documentElement.getAttribute("data-exercise"), 10);
    return n >= 1 && n <= 62 ? n : null;
  }

  function link(n) { return n ? SITE + n + "/" : SITE; }
  function title(n) { return "Exercises for the Recovery of Childhood" + (n ? ", #" + n : ""); }

  // Phones and tablets get the share menu; computers get "copy link".
  var touch = false;
  try { touch = window.matchMedia("(pointer: coarse)").matches; } catch (e) {}
  var canMenu = touch && typeof navigator.share === "function";

  // The share menu must open straight from the tap, so the image is fetched
  // ahead of time. If it isn't ready yet, the link goes out on its own.
  var files = {};
  function prefetch() {
    var n = exercise();
    if (!n || files[n] || !window.fetch || typeof File !== "function") return;
    files[n] = "loading";
    fetch(SITE.replace(/\/$/, "") + "/img/exercise-" + n + ".jpg")
      .then(function (r) { return r.ok ? r.blob() : null; })
      .then(function (b) {
        if (!b) { delete files[n]; return; }
        var f = new File([b], "exercise-" + n + ".jpg", { type: "image/jpeg" });
        files[n] = navigator.canShare && navigator.canShare({ files: [f] }) ? f : null;
      })
      .catch(function () { delete files[n]; });
  }
  if (canMenu) {
    // Wait for the home page to pick its exercise, then fetch quietly.
    var later = function () { setTimeout(prefetch, 800); };
    if (document.readyState === "complete") later();
    else window.addEventListener("load", later);
  }

  function report(how) {
    try {
      document.dispatchEvent(new CustomEvent("erc:share", { detail: { how: how, x: exercise() } }));
    } catch (e) {}
  }

  function toast(msg) {
    var el = document.createElement("div");
    el.className = "share-toast";
    el.setAttribute("role", "status");
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add("on"); }, 20);
    setTimeout(function () {
      el.classList.remove("on");
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
    }, 2400);
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (ok, fail) {
      var t = document.createElement("textarea");
      t.value = text;
      t.setAttribute("readonly", "");
      t.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.appendChild(t);
      t.select();
      var done = false;
      try { done = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(t);
      done ? ok() : fail();
    });
  }

  function copyLink(n) {
    copy(link(n)).then(
      function () { toast("Link copied"); report("copy"); },
      function () { toast(link(n)); report("copy-failed"); }
    );
  }

  btn.addEventListener("click", function () {
    var n = exercise();
    if (!canMenu) { copyLink(n); return; }

    var f = files[n];
    var data = f && f !== "loading"
      ? { files: [f], title: title(n), text: title(n) + "\n" + link(n) }
      : { title: title(n), url: link(n) };

    navigator.share(data).then(
      function () { report(data.files ? "menu-image" : "menu-link"); },
      function (err) {
        if (err && err.name === "AbortError") { report("menu-cancel"); return; }
        copyLink(n); // the menu refused (rare); fall back to copying
      }
    );
  });
})();
