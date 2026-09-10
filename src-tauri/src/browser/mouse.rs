//! Back and forward from the mouse's side buttons.
//!
//! Five-button mice send these as buttons 4 and 5 (numbered 3 and 4 from
//! zero). No engine this app embeds acts on them by itself, and the content
//! webview holds keyboard and mouse focus whenever a site is open, so the
//! chrome webview never sees the click either — which is why pressing Back on
//! the mouse did nothing at all while browsing.
//!
//! On macOS an application-wide event monitor catches the click before it
//! reaches any view and forwards it to the chrome as an event. The chrome then
//! runs the same two-stage Back the toolbar button does: through the site's own
//! history first, then out to the app's route stack — so holding Back
//! eventually returns to FMHY rather than stalling inside a site.
//!
//! Windows and Linux are covered from inside the page instead, by the shield
//! script, because their engines do deliver these buttons to the DOM. WebKit
//! does not, hence the native monitor here.

use tauri::{AppHandle, Runtime};

/// Event name the chrome listens for. Payload: `{ "back": bool }`.
pub const EVENT: &str = "browser://mouse-nav";

/// Button numbers, as reported by the platform (zero-based, so button 4 is 3).
const BUTTON_BACK: isize = 3;
const BUTTON_FORWARD: isize = 4;

#[cfg(target_os = "macos")]
pub fn install<R: Runtime>(app: &AppHandle<R>) {
    use std::ptr::NonNull;

    use block2::RcBlock;
    use objc2_app_kit::{NSEvent, NSEventMask, NSEventType};
    use tauri::Emitter;

    use super::CHROME_WEBVIEW;

    let app = app.clone();

    // Both halves of the click are swallowed: letting the release through
    // without its press leaves pages that track mouse state confused.
    let mask = NSEventMask::OtherMouseDown | NSEventMask::OtherMouseUp;

    let handler = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
        let event = unsafe { event.as_ref() };
        let button = event.buttonNumber();
        let back = match button {
            BUTTON_BACK => true,
            BUTTON_FORWARD => false,
            // Anything else is a genuine middle/extra click the page may want.
            _ => return event as *const NSEvent as *mut NSEvent,
        };

        // Act once per click, on the press.
        if event.r#type() == NSEventType::OtherMouseDown {
            let _ = app.emit_to(CHROME_WEBVIEW, EVENT, serde_json::json!({ "back": back }));
        }

        // Returning null consumes the event, so the page never sees it.
        std::ptr::null_mut()
    });

    let monitor = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(mask, &handler) };

    // The monitor lives for the life of the process. AppKit keeps its own
    // reference, but holding ours would mean carrying it through app state for
    // no purpose, so it is deliberately leaked rather than dropped — dropping
    // it is what would be wrong here.
    std::mem::forget(monitor);
}

/// Windows and Linux deliver these buttons to the page, where the shield
/// script handles them.
#[cfg(not(target_os = "macos"))]
pub fn install<R: Runtime>(_app: &AppHandle<R>) {}

/// Document-start script covering the platforms whose engines *do* deliver the
/// side buttons to the page.
///
/// Only the site's own history is reachable from here — a page cannot ask the
/// app to leave the site — so Back from the mouse stops at a site's first page
/// on these platforms rather than continuing out to FMHY. The toolbar button
/// still walks the whole way. macOS needs none of this: the native monitor
/// above catches the click first and consumes it.
#[cfg(not(target_os = "macos"))]
pub const SCRIPT: &str = r#"
(function () {
  'use strict';
  function handle(event) {
    if (event.button !== 3 && event.button !== 4) return;
    // Swallow every phase of the click so the page cannot act on it too.
    event.preventDefault();
    event.stopPropagation();
    if (event.type !== 'mousedown') return;
    try {
      if (event.button === 3) history.back();
      else history.forward();
    } catch (e) {}
  }
  addEventListener('mousedown', handle, true);
  addEventListener('mouseup', handle, true);
  addEventListener('auxclick', handle, true);
})();
"#;

#[cfg(target_os = "macos")]
pub const SCRIPT: &str = "";
