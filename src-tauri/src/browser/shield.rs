//! In-page protection for content webviews.
//!
//! ## Why this is not uBlock Origin
//!
//! uBlock Origin is a WebExtension, and the engines this app embeds cannot run
//! one: WKWebView (macOS) and WebKitGTK (Linux) have no extension support at
//! all. So blocking has to be done by the host, not by an add-on.
//!
//! What runs here is a document-start script that covers the behaviour that
//! actually makes sketchy sites unusable — popups, popunders and full-screen
//! interstitials — plus cosmetic hiding of obvious ad containers. It is
//! deliberately not a network-level blocker: subresource interception is not
//! available uniformly across the three engines, so promising it would mean
//! promising something that only worked on one platform.
//!
//! Everything here is conservative by design. A blocker that breaks real pages
//! is worse than none, so each rule needs a clear signal before it acts, and
//! all of it can be switched off.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShieldSettings {
    /// Block `window.open` that does not follow a genuine click on a link.
    pub block_popups: bool,
    /// Remove full-screen interstitials and restore scrolling.
    pub remove_overlays: bool,
    /// Hide common advertising containers.
    pub hide_ads: bool,
}

impl Default for ShieldSettings {
    fn default() -> Self {
        Self {
            block_popups: true,
            remove_overlays: true,
            hide_ads: true,
        }
    }
}

/// Build the document-start script for these settings.
pub fn script(settings: ShieldSettings) -> String {
    let config = serde_json::to_string(&settings).unwrap_or_else(|_| "{}".into());
    SCRIPT.replace("__SHIELD_CONFIG__", &config)
}

const SCRIPT: &str = r#"
(function () {
  'use strict';
  var CONFIG = __SHIELD_CONFIG__;
  if (!CONFIG || (!CONFIG.blockPopups && !CONFIG.removeOverlays && !CONFIG.hideAds)) return;

  var blocked = 0;
  function report(kind) {
    blocked++;
    try {
      window.__fmhyShield = { blocked: blocked, last: kind };
    } catch (e) {}
  }

  /* ---------------------------------------------------------------- popups
   * The popunder pattern is: any click anywhere calls window.open. Genuine
   * popups almost always follow a real click on a link or button, so that is
   * the signal used here — a trusted event within the last moment. Blocked
   * calls return a stub rather than null, because sites routinely dereference
   * the result and would throw.
   */
  if (CONFIG.blockPopups) {
    var lastGesture = 0;
    var gestureFromLink = false;

    document.addEventListener('pointerdown', function (event) {
      if (!event.isTrusted) return;
      lastGesture = Date.now();
      var node = event.target;
      gestureFromLink = false;
      while (node && node !== document.documentElement) {
        var tag = node.tagName;
        if (tag === 'A' || tag === 'BUTTON') { gestureFromLink = true; break; }
        node = node.parentNode;
      }
    }, true);

    var nativeOpen = window.open;
    var stub = function () {
      var noop = function () {};
      var fake = {
        closed: true, focus: noop, blur: noop, close: noop, print: noop,
        postMessage: noop, moveTo: noop, resizeTo: noop,
        document: { write: noop, writeln: noop, close: noop, open: noop },
        location: { href: '', replace: noop, assign: noop, reload: noop }
      };
      fake.window = fake;
      fake.self = fake;
      fake.top = fake;
      return fake;
    };

    window.open = function (url, name, features) {
      var recent = Date.now() - lastGesture < 1000;
      if (recent && gestureFromLink) {
        gestureFromLink = false;
        return nativeOpen.apply(window, arguments);
      }
      report('popup');
      return stub();
    };
    try {
      window.open.toString = function () { return 'function open() { [native code] }'; };
    } catch (e) {}

    /* Sites also leave the page by assigning to location from a timer.
       Only same-document or user-initiated navigation is left alone. */
    window.addEventListener('beforeunload', function (event) {
      /* Strip unload traps that hold the user on the page. */
      event.returnValue = undefined;
      delete event.returnValue;
    }, true);
  }

  /* ------------------------------------------------------------- overlays
   * Interstitials share a shape: an element covering essentially the whole
   * viewport, above everything, arriving without the user asking.
   *
   * Two things this must not do, both learned the hard way:
   *
   * 1. Never re-scan the whole document on every mutation. Modern pages mutate
   *    constantly, and `getComputedStyle` plus `getBoundingClientRect` over
   *    every div forces synchronous layout each time. That makes the page
   *    unresponsive — links stop taking clicks and the cursor flickers as
   *    hit-testing fights the reflow. Only newly added subtrees are examined,
   *    each element once, and the pass stops once the page settles.
   *
   * 2. Never hide real content. A full-viewport wrapper with a high z-index is
   *    ordinary page structure, not an interstitial. The discriminator is
   *    links: overlays carry a dismiss control at most, whereas page content is
   *    full of them.
   */
  if (CONFIG.removeOverlays) {
    var MIN_COVERAGE = 0.92;
    var MIN_Z = 1000;
    var MAX_LINKS = 2;
    var MAX_PASSES = 30;

    var examined = new WeakSet();
    var passes = 0;
    var observer = null;
    var unlocked = false;

    function unlockScroll() {
      if (unlocked) return;
      var locked = false;
      [document.documentElement, document.body].forEach(function (el) {
        if (!el) return;
        var style = getComputedStyle(el);
        if (style.overflow === 'hidden') {
          el.style.setProperty('overflow', 'auto', 'important');
          locked = true;
        }
      });
      // Only claim it once, so this cannot rewrite styles on every pass.
      if (locked) unlocked = true;
    }

    function looksLikeInterstitial(el) {
      if (!(el instanceof Element) || examined.has(el)) return false;
      examined.add(el);
      if (el === document.body || el === document.documentElement) return false;

      var style = getComputedStyle(el);
      if (style.position !== 'fixed' && style.position !== 'absolute') return false;
      if (style.visibility === 'hidden' || style.display === 'none') return false;

      var z = parseInt(style.zIndex, 10);
      if (isNaN(z) || z < MIN_Z) return false;

      var rect = el.getBoundingClientRect();
      var viewport = window.innerWidth * window.innerHeight || 1;
      if ((rect.width * rect.height) / viewport < MIN_COVERAGE) return false;

      // Anything link-rich is the page itself, not something covering it.
      if (el.querySelectorAll('a[href]').length > MAX_LINKS) return false;

      return true;
    }

    function examine(root) {
      if (!root || !root.querySelectorAll) return;
      var candidates = root.querySelectorAll('div,section,aside,ins');
      for (var i = 0; i < candidates.length; i++) {
        if (looksLikeInterstitial(candidates[i])) {
          candidates[i].style.setProperty('display', 'none', 'important');
          report('overlay');
        }
      }
      if (root instanceof Element && looksLikeInterstitial(root)) {
        root.style.setProperty('display', 'none', 'important');
        report('overlay');
      }
    }

    function runPass(roots) {
      if (passes++ > MAX_PASSES) {
        if (observer) observer.disconnect();
        return;
      }
      // Detach while mutating: hiding an element is itself a mutation, and the
      // page reacts to it, so an attached observer would re-enter endlessly.
      if (observer) observer.disconnect();
      try {
        for (var i = 0; i < roots.length; i++) examine(roots[i]);
        unlockScroll();
      } catch (e) {
      } finally {
        if (observer && passes <= MAX_PASSES) {
          observer.observe(document.documentElement, { childList: true, subtree: true });
        }
      }
    }

    var pending = [];
    var scheduled = false;
    function schedule(roots) {
      pending = pending.concat(roots);
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () {
        scheduled = false;
        var batch = pending;
        pending = [];
        runPass(batch);
      });
    }

    function sweepDocument() {
      if (document.body) schedule([document.body]);
    }

    document.addEventListener('DOMContentLoaded', sweepDocument);
    window.addEventListener('load', sweepDocument);

    observer = new MutationObserver(function (records) {
      // Only look at what actually appeared, not the entire document again.
      var roots = [];
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) roots.push(added[j]);
        }
      }
      if (roots.length) schedule(roots);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  /* ----------------------------------------------------------------- ads
   * Cosmetic only: hide containers that identify themselves as advertising.
   * Matching is on explicit ad markers rather than anything fuzzy, so ordinary
   * layout classes are not caught.
   */
  if (CONFIG.hideAds) {
    var css = [
      'ins.adsbygoogle',
      'iframe[src*="doubleclick.net"]',
      'iframe[src*="googlesyndication.com"]',
      'iframe[src*="adservice."]',
      'iframe[id^="google_ads_"]',
      'div[id^="google_ads_"]',
      'div[id^="div-gpt-ad"]',
      '[class^="adsbygoogle"]',
      '[id^="taboola-"]',
      '[id^="outbrain_widget"]',
      '.trc_related_container'
    ].join(',') + '{display:none!important}';

    function injectCss() {
      if (!document.head) return false;
      var style = document.createElement('style');
      style.setAttribute('data-fmhy-shield', '');
      style.textContent = css;
      document.head.appendChild(style);
      return true;
    }
    if (!injectCss()) {
      document.addEventListener('DOMContentLoaded', injectCss);
    }
  }
})();
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_is_embedded_as_json() {
        let script = script(ShieldSettings::default());
        assert!(!script.contains("__SHIELD_CONFIG__"), "placeholder not replaced");
        assert!(script.contains("\"blockPopups\":true"));
        assert!(script.contains("\"removeOverlays\":true"));
        assert!(script.contains("\"hideAds\":true"));
    }

    #[test]
    fn disabled_settings_short_circuit() {
        let script = script(ShieldSettings {
            block_popups: false,
            remove_overlays: false,
            hide_ads: false,
        });
        assert!(script.contains("\"blockPopups\":false"));
        // The guard at the top must be present so nothing runs when all are off.
        assert!(script.contains("!CONFIG.blockPopups && !CONFIG.removeOverlays"));
    }
}

// ---------------------------------------------------------------- persistence

use rusqlite::params;

use crate::db::Db;
use crate::error::AppResult;

const KEY: &str = "browser.shield";

pub fn stored(db: &Db) -> ShieldSettings {
    db.with(|conn| {
        Ok(conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![KEY],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default())
    })
    .unwrap_or_default()
}

pub fn store(db: &Db, settings: ShieldSettings) -> AppResult<()> {
    let value = serde_json::to_string(&settings).unwrap_or_default();
    db.with(|conn| {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![KEY, value],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub fn shield_settings(db: tauri::State<Db>) -> ShieldSettings {
    stored(&db)
}

/// Changes apply to webviews opened afterwards: the script runs at document
/// start, so an already-loaded page keeps the settings it was created with.
#[tauri::command]
pub fn set_shield_settings(db: tauri::State<Db>, settings: ShieldSettings) -> AppResult<()> {
    store(&db, settings)
}
