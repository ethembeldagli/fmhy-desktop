//! Filter-list compilation using Brave's ad-blocking engine.
//!
//! `adblock` is the engine that ships in Brave Browser. It parses the same
//! Adblock Plus / uBlock Origin filter syntax that uBO itself consumes —
//! EasyList, EasyPrivacy, uBO's own lists — and can emit them as WebKit
//! content-blocker rules.
//!
//! That format is what makes this work without an extension host: WKWebView
//! (`WKContentRuleList`) and WebKitGTK (`WebKitUserContentFilterStore`) both
//! compile it natively and enforce it in the network path, before a request
//! leaves the process. It is the same mechanism Safari content blockers use.
//!
//! Using Brave's parser rather than our own means the awkward parts of the
//! syntax — option combinations, domain negation, regex filters, cosmetic
//! rules — are handled by code that blocks ads for millions of users, instead
//! of by a converter maintained here.

use adblock::lists::{FilterSet, ParseOptions};

use crate::error::{AppError, AppResult};

#[derive(Debug, Default, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileStats {
    /// Content-blocker rules produced. One source filter can expand into
    /// several, so this exceeds `source_filters`.
    pub rules: usize,
    /// Source filters the engine successfully converted.
    pub source_filters: usize,
    pub bytes: usize,
    pub millis: u128,
}

/// Compile filter lists into WebKit content-blocker JSON.
pub fn compile(lists: &[String]) -> AppResult<(String, CompileStats)> {
    let started = std::time::Instant::now();

    // Debug mode retains the source of each filter, which the content-blocking
    // conversion needs in order to report what it could not express.
    let mut set = FilterSet::new(true);
    for list in lists {
        set.add_filter_list(list.clone(), ParseOptions::default());
    }

    let (rules, converted) = set
        .into_content_blocking()
        .map_err(|_| AppError::Other("filter set could not be converted".into()))?;

    let json = serde_json::to_string(&rules)
        .map_err(|error| AppError::Other(format!("serialising rules: {error}")))?;

    let stats = CompileStats {
        rules: rules.len(),
        source_filters: converted.len(),
        bytes: json.len(),
        millis: started.elapsed().as_millis(),
    };

    Ok((json, stats))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compiles_a_small_list() {
        let list = "\
||ads.example.com^\n\
||track.example.com^$script,third-party\n\
@@||ads.example.com/allowed^\n\
example.com##.ad-banner\n";
        let (json, stats) = compile(&[list.to_string()]).expect("compile");
        assert!(stats.rules >= 3, "got {} rules", stats.rules);
        assert!(json.starts_with('['));
        assert!(json.contains("url-filter"));
    }

    #[test]
    fn empty_input_is_not_an_error() {
        let (json, stats) = compile(&[String::new()]).expect("compile");
        assert_eq!(stats.rules, 0);
        assert_eq!(json, "[]");
    }
}

/// Comparison against real lists.
///
/// `FILTER_LIST=/path/to/easylist.txt cargo test engine::corpus -- --ignored --nocapture`
#[cfg(test)]
mod corpus {
    use super::*;

    #[test]
    #[ignore]
    fn compiles_real_filter_lists() {
        let Ok(path) = std::env::var("FILTER_LIST") else {
            eprintln!("set FILTER_LIST to run");
            return;
        };
        let list = std::fs::read_to_string(&path).expect("read list");

        let (json, stats) = compile(&[list.clone()]).expect("compile");
        println!("\n--- brave adblock engine ---");
        println!("  source lines : {}", list.lines().count());
        println!("  rules        : {}", stats.rules);
        println!("  filters used : {}", stats.source_filters);
        println!("  json         : {:.1} MB", stats.bytes as f64 / 1_048_576.0);
        println!("  time         : {} ms", stats.millis);

        // Same list through the hand-written converter, for comparison.
        let (mine, my_stats) = super::super::convert::convert(&list, 150_000);
        let my_total = my_stats.network + my_stats.cosmetic + my_stats.exceptions;
        println!("--- hand-written converter ---");
        println!("  rules        : {my_total}");
        println!("  skipped      : {}", my_stats.skipped);
        println!("  (network {} / cosmetic {} / exceptions {})",
                 my_stats.network, my_stats.cosmetic, my_stats.exceptions);
        assert!(!mine.is_empty());

        // Output must be valid, non-empty content-blocker JSON.
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("valid json");
        assert!(parsed.as_array().map(|a| !a.is_empty()).unwrap_or(false));
        assert!(stats.rules > 10_000, "expected a substantial ruleset");
    }
}
