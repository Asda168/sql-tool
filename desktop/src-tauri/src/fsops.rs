//! Local filesystem commands. Everything here runs only in response to an explicit user action in the UI.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
}

#[derive(Serialize)]
pub struct ProjectInfo {
    kind: &'static str,
    label: &'static str,
    commands: Vec<&'static str>,
}

#[derive(Serialize)]
pub struct Hit {
    path: String,
    line: usize,
    preview: String,
}

fn s(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
pub fn fs_home() -> Result<String, String> {
    let h = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).map_err(s)?;
    Ok(h)
}

#[tauri::command]
pub fn fs_list(path: String) -> Result<Vec<DirEntry>, String> {
    let mut out = Vec::new();
    for e in fs::read_dir(&path).map_err(s)? {
        let e = e.map_err(s)?;
        let name = e.file_name().to_string_lossy().to_string();
        if name == ".git" {
            continue;
        }
        let md = e.metadata().map_err(s)?;
        out.push(DirEntry { name, path: e.path().to_string_lossy().to_string(), is_dir: md.is_dir(), size: md.len() });
    }
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

#[tauri::command]
pub fn fs_read(path: String) -> Result<String, String> {
    let md = fs::metadata(&path).map_err(s)?;
    if md.len() > 20 * 1024 * 1024 {
        return Err("File is larger than 20 MB; open it with another tool.".into());
    }
    let bytes = fs::read(&path).map_err(s)?;
    String::from_utf8(bytes).map_err(|_| "This looks like a binary file (not valid UTF-8).".to_string())
}

#[tauri::command]
pub fn fs_write(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(s)
}

#[tauri::command]
pub fn fs_create_file(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err("A file or folder with that name already exists.".into());
    }
    fs::OpenOptions::new().write(true).create_new(true).open(&path).map(|_| ()).map_err(s)
}

#[tauri::command]
pub fn fs_create_dir(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err("A file or folder with that name already exists.".into());
    }
    fs::create_dir_all(&path).map_err(s)
}

#[tauri::command]
pub fn fs_rename(from: String, to: String) -> Result<(), String> {
    if Path::new(&to).exists() {
        return Err("The target already exists.".into());
    }
    fs::rename(&from, &to).map_err(s)
}

/// Moves to the recycle bin / trash so a mistaken delete is recoverable; falls back to permanent delete only if that is impossible.
#[tauri::command]
pub fn fs_remove(path: String) -> Result<(), String> {
    if trash::delete(&path).is_ok() {
        return Ok(());
    }
    let p = Path::new(&path);
    if p.is_dir() { fs::remove_dir_all(p) } else { fs::remove_file(p) }.map_err(s)
}

fn copy_rec(from: &Path, to: &Path) -> std::io::Result<()> {
    if from.is_dir() {
        fs::create_dir_all(to)?;
        for e in fs::read_dir(from)? {
            let e = e?;
            copy_rec(&e.path(), &to.join(e.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(from, to).map(|_| ())
    }
}

#[tauri::command]
pub fn fs_copy(from: String, to: String) -> Result<(), String> {
    let (f, t) = (PathBuf::from(&from), PathBuf::from(&to));
    if t.exists() {
        return Err("The target already exists.".into());
    }
    if t.starts_with(&f) && f.is_dir() {
        return Err("Cannot copy a folder into itself.".into());
    }
    copy_rec(&f, &t).map_err(s)
}

#[tauri::command]
pub fn fs_reveal(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer").raw_arg(format!("/select,\"{}\"", path.replace('/', "\\"))).spawn().map_err(s)?;
    }
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").args(["-R", &path]).spawn().map_err(s)?;
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let dir = Path::new(&path).parent().map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from("/"));
        std::process::Command::new("xdg-open").arg(dir).spawn().map_err(s)?;
    }
    Ok(())
}

#[tauri::command]
pub fn fs_detect_project(path: String) -> ProjectInfo {
    let has = |n: &str| Path::new(&path).join(n).exists();
    if has("artisan") && has("composer.json") {
        ProjectInfo { kind: "laravel", label: "Laravel Project", commands: vec!["php artisan serve", "php artisan migrate", "php artisan route:list", "php artisan queue:work"] }
    } else if has("manage.py") {
        ProjectInfo { kind: "django", label: "Django Project", commands: vec!["python manage.py runserver", "python manage.py migrate", "python manage.py makemigrations"] }
    } else if has("package.json") {
        ProjectInfo { kind: "node", label: "Node Project", commands: vec!["npm install", "npm run dev", "npm test"] }
    } else if has("requirements.txt") || has("pyproject.toml") {
        ProjectInfo { kind: "python", label: "Python Project", commands: vec!["pip install -r requirements.txt"] }
    } else if has("composer.json") {
        ProjectInfo { kind: "php", label: "PHP Project", commands: vec!["composer install"] }
    } else {
        ProjectInfo { kind: "generic", label: "Project", commands: vec![] }
    }
}

fn walk(dir: &Path, needle: &str, out: &mut Vec<Hit>, depth: usize) {
    if depth > 12 || out.len() >= 500 {
        return;
    }
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if matches!(name.as_str(), ".git" | "node_modules" | "target" | "dist" | "__pycache__" | ".venv" | "vendor") {
            continue;
        }
        let p = e.path();
        if p.is_dir() {
            walk(&p, needle, out, depth + 1);
        } else if e.metadata().map(|m| m.len() < 1_000_000).unwrap_or(false) {
            if let Ok(text) = fs::read_to_string(&p) {
                for (i, l) in text.lines().enumerate() {
                    if l.to_lowercase().contains(needle) {
                        out.push(Hit { path: p.to_string_lossy().to_string(), line: i + 1, preview: l.trim().chars().take(200).collect() });
                        if out.len() >= 500 {
                            return;
                        }
                    }
                }
            }
        }
    }
}

#[tauri::command]
pub async fn fs_search(root: String, text: String) -> Result<Vec<Hit>, String> {
    tokio::task::spawn_blocking(move || {
        let mut out = Vec::new();
        if !text.is_empty() {
            walk(Path::new(&root), &text.to_lowercase(), &mut out, 0);
        }
        out
    })
    .await
    .map_err(s)
}
