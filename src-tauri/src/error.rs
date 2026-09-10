use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),

    #[error("invalid url: {0}")]
    Url(#[from] url::ParseError),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("no such tab: {0}")]
    UnknownTab(String),

    #[error("{0}")]
    Other(String),
}

pub type AppResult<T> = Result<T, AppError>;

// Commands return errors to the chrome webview as plain strings; the frontend
// never needs to discriminate variants, and leaking internals would be noise.
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
