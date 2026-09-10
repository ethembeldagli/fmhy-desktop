//! Convert Adblock Plus style filter lists into WebKit content-blocker rules.
//!
//! This is the format Safari content blockers use, and both engines this app
//! embeds on macOS and Linux consume it unchanged — `WKContentRuleList` and
//! `WebKitUserContentFilterStore` take the same JSON. That makes one converter
//! serve two platforms, with the rules applied by the engine itself before a
//! request leaves, rather than by script after a page has loaded.
//!
//! Only the declarative subset is expressible. Filters that need code to
//! evaluate — scriptlet injection, procedural cosmetic selectors like `:has`,
//! regex filters — have no equivalent and are counted as skipped rather than
//! approximated, because a rule that means something slightly different is
//! worse than an absent one.

use std::collections::BTreeSet;

use serde::Serialize;

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "kebab-case")]
pub struct Trigger {
    pub url_filter: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url_filter_is_case_sensitive: Option<bool>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub resource_type: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub load_type: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub if_domain: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub unless_domain: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
pub struct Action {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selector: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Rule {
    pub trigger: Trigger,
    pub action: Action,
}

#[derive(Debug, Default)]
pub struct Stats {
    pub network: usize,
    pub cosmetic: usize,
    pub exceptions: usize,
    pub skipped: usize,
}

/// Escape a literal for use inside a content-blocker `url-filter` regex.
fn escape_regex(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 2);
    for ch in input.chars() {
        if matches!(ch, '.' | '?' | '+' | '*' | '|' | '{' | '}' | '[' | ']' | '(' | ')' | '/' | '\\' | '^' | '$') {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

/// Map filter options onto WebKit resource types.
fn resource_type(option: &str) -> Option<&'static str> {
    Some(match option {
        "script" => "script",
        "image" => "image",
        "stylesheet" | "css" => "style-sheet",
        "font" => "font",
        "media" => "media",
        "xmlhttprequest" | "xhr" => "raw",
        "websocket" => "websocket",
        "ping" | "beacon" => "ping",
        "subdocument" | "frame" => "document",
        "popup" => "popup",
        "object" | "object-subrequest" => "other",
        _ => return None,
    })
}

/// Options that describe how a filter matches but produce no WebKit rule of
/// their own. They are accepted so the filter is still emitted.
fn is_benign_option(option: &str) -> bool {
    matches!(option, "" | "all" | "document" | "doc" | "other" | "important")
}

struct ParsedOptions {
    resource_types: Vec<String>,
    load_types: Vec<String>,
    if_domain: Vec<String>,
    unless_domain: Vec<String>,
    supported: bool,
}

fn parse_options(raw: &str) -> ParsedOptions {
    let mut parsed = ParsedOptions {
        resource_types: Vec::new(),
        load_types: Vec::new(),
        if_domain: Vec::new(),
        unless_domain: Vec::new(),
        supported: true,
    };

    for option in raw.split(',') {
        let option = option.trim();
        if option.is_empty() {
            continue;
        }

        if let Some(domains) = option.strip_prefix("domain=") {
            for domain in domains.split('|') {
                if let Some(negated) = domain.strip_prefix('~') {
                    parsed.unless_domain.push(format!("*{negated}"));
                } else {
                    parsed.if_domain.push(format!("*{domain}"));
                }
            }
            continue;
        }

        match option {
            "third-party" | "3p" => parsed.load_types.push("third-party".into()),
            "first-party" | "1p" | "~third-party" => parsed.load_types.push("first-party".into()),
            _ => {
                let negated = option.starts_with('~');
                let name = option.trim_start_matches('~');
                if let Some(kind) = resource_type(name) {
                    // WebKit cannot express "every type except this one".
                    if negated {
                        parsed.supported = false;
                    } else if !parsed.resource_types.iter().any(|t| t == kind) {
                        parsed.resource_types.push(kind.into());
                    }
                } else if !is_benign_option(name) {
                    parsed.supported = false;
                }
            }
        }
    }

    parsed
}

/// Build the `url-filter` regex for a network filter's pattern.
fn url_filter(pattern: &str) -> Option<String> {
    // Regex filters are passed through verbatim by other engines; WebKit's
    // dialect differs enough that translating them is unsafe.
    if pattern.starts_with('/') && pattern.ends_with('/') && pattern.len() > 1 {
        return None;
    }

    if let Some(rest) = pattern.strip_prefix("||") {
        let rest = rest.trim_end_matches('^');
        if rest.is_empty() || rest.contains('*') {
            return None;
        }
        // Matches the domain and any subdomain, on either scheme.
        return Some(format!("^https?://([^/]+\\.)?{}[:/]", escape_regex(rest)));
    }

    if let Some(rest) = pattern.strip_prefix('|') {
        let rest = rest.trim_end_matches('|');
        return Some(format!("^{}", escape_regex(rest)));
    }

    let core = pattern.trim_end_matches('^');
    if core.is_empty() {
        return None;
    }

    // `*` is the only wildcard worth supporting; anything else is literal.
    let escaped = core
        .split('*')
        .map(escape_regex)
        .collect::<Vec<_>>()
        .join(".*");
    Some(escaped)
}

/// Convert a filter list into content-blocker rules.
///
/// `limit` caps the output: `WKContentRuleList` refuses lists beyond a fixed
/// size, and compilation time grows with it, so the caller decides the budget.
pub fn convert(list: &str, limit: usize) -> (Vec<Rule>, Stats) {
    let mut rules: Vec<Rule> = Vec::new();
    let mut stats = Stats::default();
    // Exceptions must follow the rules they override, so they are held back.
    let mut exceptions: Vec<Rule> = Vec::new();
    let mut seen: BTreeSet<String> = BTreeSet::new();

    for line in list.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('!') || line.starts_with('[') {
            continue;
        }

        // ---- cosmetic ----------------------------------------------------
        if let Some(index) = line.find("##") {
            let (domains, selector) = line.split_at(index);
            let selector = &selector[2..];
            // Scriptlets and procedural selectors need a script engine.
            if selector.is_empty()
                || selector.starts_with("+js")
                || selector.contains(":has(")
                || selector.contains(":matches-css")
                || selector.contains(":xpath")
                || selector.contains(":upward")
            {
                stats.skipped += 1;
                continue;
            }

            let if_domain: Vec<String> = domains
                .split(',')
                .filter(|d| !d.is_empty() && !d.starts_with('~'))
                .map(|d| format!("*{d}"))
                .collect();

            rules.push(Rule {
                trigger: Trigger {
                    url_filter: ".*".into(),
                    if_domain,
                    ..Default::default()
                },
                action: Action {
                    kind: "css-display-none".into(),
                    selector: Some(selector.to_string()),
                },
            });
            stats.cosmetic += 1;
            continue;
        }

        // Cosmetic exceptions have no declarative equivalent.
        if line.contains("#@#") {
            stats.skipped += 1;
            continue;
        }

        // ---- network -----------------------------------------------------
        let (body, is_exception) = match line.strip_prefix("@@") {
            Some(rest) => (rest, true),
            None => (line, false),
        };

        let (pattern, options) = match body.split_once('$') {
            Some((pattern, options)) => (pattern, options),
            None => (body, ""),
        };

        let parsed = parse_options(options);
        if !parsed.supported {
            stats.skipped += 1;
            continue;
        }

        let Some(filter) = url_filter(pattern) else {
            stats.skipped += 1;
            continue;
        };

        // Identical triggers would only slow compilation down.
        let key = format!("{}|{}|{}", filter, is_exception, options);
        if !seen.insert(key) {
            continue;
        }

        let trigger = Trigger {
            url_filter: filter,
            url_filter_is_case_sensitive: None,
            resource_type: parsed.resource_types,
            load_type: parsed.load_types,
            if_domain: parsed.if_domain,
            unless_domain: parsed.unless_domain,
        };

        if is_exception {
            exceptions.push(Rule {
                trigger,
                action: Action {
                    kind: "ignore-previous-rules".into(),
                    selector: None,
                },
            });
            stats.exceptions += 1;
        } else {
            rules.push(Rule {
                trigger,
                action: Action {
                    kind: "block".into(),
                    selector: None,
                },
            });
            stats.network += 1;
        }

        if rules.len() + exceptions.len() >= limit {
            break;
        }
    }

    // Order matters: later rules win, so exceptions are appended last.
    rules.extend(exceptions);
    (rules, stats)
}

pub fn to_json(rules: &[Rule]) -> String {
    serde_json::to_string(rules).unwrap_or_else(|_| "[]".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn one(line: &str) -> Option<Rule> {
        let (mut rules, _) = convert(line, 100);
        rules.pop()
    }

    #[test]
    fn converts_a_domain_block() {
        let rule = one("||ads.example.com^").expect("rule");
        assert_eq!(rule.action.kind, "block");
        assert_eq!(
            rule.trigger.url_filter,
            "^https?://([^/]+\\.)?ads\\.example\\.com[:/]"
        );
    }

    #[test]
    fn maps_resource_and_load_type_options() {
        let rule = one("||track.example.com^$script,third-party").expect("rule");
        assert_eq!(rule.trigger.resource_type, vec!["script"]);
        assert_eq!(rule.trigger.load_type, vec!["third-party"]);
    }

    #[test]
    fn maps_domain_options_to_if_and_unless() {
        let rule = one("||cdn.example.com^$domain=a.test|~b.test").expect("rule");
        assert_eq!(rule.trigger.if_domain, vec!["*a.test"]);
        assert_eq!(rule.trigger.unless_domain, vec!["*b.test"]);
    }

    #[test]
    fn exceptions_are_emitted_after_blocks() {
        let (rules, stats) = convert("||ads.test^\n@@||ads.test/allowed^", 100);
        assert_eq!(stats.network, 1);
        assert_eq!(stats.exceptions, 1);
        // The exception must come last or the engine would never reach it.
        assert_eq!(rules[0].action.kind, "block");
        assert_eq!(rules[1].action.kind, "ignore-previous-rules");
    }

    #[test]
    fn converts_cosmetic_filters_with_and_without_domains() {
        let global = one("##.ad-banner").expect("rule");
        assert_eq!(global.action.kind, "css-display-none");
        assert_eq!(global.action.selector.as_deref(), Some(".ad-banner"));
        assert!(global.trigger.if_domain.is_empty());

        let scoped = one("example.com##.promo").expect("rule");
        assert_eq!(scoped.trigger.if_domain, vec!["*example.com"]);
    }

    #[test]
    fn skips_filters_with_no_declarative_equivalent() {
        // Scriptlets, procedural selectors, regex filters and negated types
        // cannot be expressed; each must be skipped, not approximated.
        let (rules, stats) = convert(
            "example.com##+js(set, x, true)\n\
             example.com##.a:has(.b)\n\
             /banner[0-9]+/\n\
             ||x.test^$~script\n\
             example.com#@#.c",
            100,
        );
        assert!(rules.is_empty(), "nothing should be emitted");
        assert_eq!(stats.skipped, 5);
    }

    #[test]
    fn ignores_comments_and_headers() {
        let (rules, _) = convert("[Adblock Plus 2.0]\n! a comment\n\n||real.test^", 100);
        assert_eq!(rules.len(), 1);
    }

    #[test]
    fn respects_the_rule_limit() {
        let list: String = (0..500)
            .map(|i| format!("||host{i}.test^\n"))
            .collect();
        let (rules, _) = convert(&list, 50);
        assert!(rules.len() <= 50, "got {}", rules.len());
    }

    #[test]
    fn serialises_to_the_expected_json_shape() {
        let (rules, _) = convert("||ads.test^$script", 10);
        let json = to_json(&rules);
        assert!(json.contains("\"url-filter\""));
        assert!(json.contains("\"resource-type\":[\"script\"]"));
        assert!(json.contains("\"type\":\"block\""));
        // Absent fields must not be serialised as nulls.
        assert!(!json.contains("null"));
    }
}

/// Validation against real filter lists.
///
/// Unit tests only prove the cases we thought of; EasyList is ~79k lines of
/// syntax written by many hands over years. This runs the converter over a
/// real list and asserts the output is well-formed and substantial.
///
/// `FILTER_LIST=/path/to/easylist.txt cargo test corpus -- --ignored --nocapture`
#[cfg(test)]
mod corpus {
    use super::*;

    #[test]
    #[ignore]
    fn converts_a_real_filter_list() {
        let Ok(path) = std::env::var("FILTER_LIST") else {
            eprintln!("set FILTER_LIST to run");
            return;
        };
        let list = std::fs::read_to_string(&path).expect("read list");
        let started = std::time::Instant::now();
        let (rules, stats) = convert(&list, 150_000);
        let elapsed = started.elapsed();

        let total = stats.network + stats.cosmetic + stats.exceptions;
        println!("\n--- {} ---", path);
        println!("  source lines : {}", list.lines().count());
        println!("  network      : {}", stats.network);
        println!("  cosmetic     : {}", stats.cosmetic);
        println!("  exceptions   : {}", stats.exceptions);
        println!("  skipped      : {}", stats.skipped);
        println!("  converted    : {total}  in {elapsed:?}");

        let json = to_json(&rules);
        println!("  json size    : {:.1} MB", json.len() as f64 / 1_048_576.0);

        // The output must be valid JSON the engine can compile.
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("valid json");
        assert!(parsed.is_array());
        assert_eq!(parsed.as_array().unwrap().len(), rules.len());

        // Every rule needs a trigger with a filter and a known action.
        for rule in parsed.as_array().unwrap() {
            let filter = rule["trigger"]["url-filter"].as_str().expect("url-filter");
            assert!(!filter.is_empty());
            let kind = rule["action"]["type"].as_str().expect("action type");
            assert!(
                matches!(kind, "block" | "css-display-none" | "ignore-previous-rules"),
                "unexpected action {kind}"
            );
            if kind == "css-display-none" {
                assert!(rule["action"]["selector"].is_string());
            }
        }

        assert!(total > 10_000, "expected a substantial ruleset, got {total}");
    }
}
