use url::Url;

/// Per-tab session history.
///
/// Neither Tauri nor wry expose the webview's native back/forward stack, so we
/// model it ourselves and traverse by re-navigating. Every navigation the
/// webview performs is reported through `on_navigation`, which is the only
/// signal we get, so this type has to distinguish a *user* navigation (push,
/// discarding any forward entries) from one we caused by traversing (move the
/// cursor, keep the stack intact).
#[derive(Debug, Default)]
pub struct SessionHistory {
    entries: Vec<Url>,
    cursor: usize,
    /// Set immediately before we drive a traversal so the resulting
    /// `on_navigation` callback is not mistaken for a fresh navigation.
    pending_traversal: Option<Url>,
}

impl SessionHistory {
    pub fn new() -> Self {
        Self::default()
    }

    /// Record a navigation observed by the webview.
    ///
    /// Returns `true` when this was a genuine new navigation (the caller should
    /// persist it to global history), `false` when it was our own traversal or
    /// a same-URL reload.
    pub fn observe(&mut self, url: &Url) -> bool {
        if let Some(expected) = &self.pending_traversal {
            if expected == url {
                self.pending_traversal = None;
                return false;
            }
            // A traversal was superseded by a real navigation (e.g. the page
            // redirected). Fall through and treat it as new.
            self.pending_traversal = None;
        }

        if self.current() == Some(url) {
            return false; // reload, or a redirect that landed where we already are
        }

        // A new navigation invalidates anything ahead of the cursor.
        if !self.entries.is_empty() {
            self.entries.truncate(self.cursor + 1);
        }
        self.entries.push(url.clone());
        self.cursor = self.entries.len() - 1;
        true
    }

    pub fn current(&self) -> Option<&Url> {
        self.entries.get(self.cursor)
    }

    pub fn can_go_back(&self) -> bool {
        self.cursor > 0 && !self.entries.is_empty()
    }

    pub fn can_go_forward(&self) -> bool {
        !self.entries.is_empty() && self.cursor + 1 < self.entries.len()
    }

    /// Move the cursor back and return the URL to navigate to.
    pub fn go_back(&mut self) -> Option<Url> {
        if !self.can_go_back() {
            return None;
        }
        self.cursor -= 1;
        let url = self.entries[self.cursor].clone();
        self.pending_traversal = Some(url.clone());
        Some(url)
    }

    pub fn go_forward(&mut self) -> Option<Url> {
        if !self.can_go_forward() {
            return None;
        }
        self.cursor += 1;
        let url = self.entries[self.cursor].clone();
        self.pending_traversal = Some(url.clone());
        Some(url)
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn observes_new_navigations() {
        let mut h = SessionHistory::new();
        assert!(h.observe(&u("https://a.test/")));
        assert!(h.observe(&u("https://b.test/")));
        assert_eq!(h.len(), 2);
        assert!(h.can_go_back());
        assert!(!h.can_go_forward());
    }

    #[test]
    fn ignores_same_url_reload() {
        let mut h = SessionHistory::new();
        assert!(h.observe(&u("https://a.test/")));
        assert!(!h.observe(&u("https://a.test/")));
        assert_eq!(h.len(), 1);
    }

    #[test]
    fn traversal_does_not_duplicate_entries() {
        let mut h = SessionHistory::new();
        h.observe(&u("https://a.test/"));
        h.observe(&u("https://b.test/"));

        let back = h.go_back().expect("can go back");
        assert_eq!(back, u("https://a.test/"));
        assert!(!h.observe(&u("https://a.test/")));
        assert_eq!(h.len(), 2);
        assert!(h.can_go_forward());

        let fwd = h.go_forward().expect("can go forward");
        assert_eq!(fwd, u("https://b.test/"));
        assert!(!h.observe(&u("https://b.test/")));
        assert_eq!(h.len(), 2);
        assert!(!h.can_go_forward());
    }

    #[test]
    fn new_navigation_truncates_forward_entries() {
        let mut h = SessionHistory::new();
        h.observe(&u("https://a.test/"));
        h.observe(&u("https://b.test/"));
        h.observe(&u("https://c.test/"));
        h.go_back();
        h.observe(&u("https://b.test/"));
        assert!(h.can_go_forward());

        assert!(h.observe(&u("https://d.test/")));
        assert!(!h.can_go_forward(), "forward entries discarded");
        assert_eq!(h.len(), 3); // a, b, d
    }

    #[test]
    fn redirect_during_traversal_is_recorded() {
        let mut h = SessionHistory::new();
        h.observe(&u("https://a.test/"));
        h.observe(&u("https://b.test/"));
        h.go_back();
        // Server redirected somewhere else instead of the expected URL.
        assert!(h.observe(&u("https://login.test/")));
        assert_eq!(h.current(), Some(&u("https://login.test/")));
    }

    #[test]
    fn empty_history_cannot_traverse() {
        let mut h = SessionHistory::new();
        assert!(!h.can_go_back());
        assert!(!h.can_go_forward());
        assert!(h.go_back().is_none());
        assert!(h.go_forward().is_none());
    }
}
