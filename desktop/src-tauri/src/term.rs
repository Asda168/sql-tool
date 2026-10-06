//! Integrated terminal: real pseudo-terminals (ConPTY on Windows) streamed to xterm.js.

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

struct Term {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct Terminals(Mutex<HashMap<String, Term>>);

#[derive(Serialize)]
pub struct Shell {
    id: &'static str,
    label: &'static str,
}

#[cfg(windows)]
fn git_bash() -> Option<PathBuf> {
    let mut c = vec![
        PathBuf::from(r"C:\Program Files\Git\bin\bash.exe"),
        PathBuf::from(r"C:\Program Files (x86)\Git\bin\bash.exe"),
    ];
    if let Ok(l) = std::env::var("LOCALAPPDATA") {
        c.push(PathBuf::from(l).join(r"Programs\Git\bin\bash.exe"));
    }
    c.into_iter().find(|p| p.exists())
}

#[tauri::command]
pub fn term_shells() -> Vec<Shell> {
    let mut v = Vec::new();
    #[cfg(windows)]
    {
        if git_bash().is_some() {
            v.push(Shell { id: "git-bash", label: "Git Bash" });
        }
        v.push(Shell { id: "powershell", label: "PowerShell" });
        v.push(Shell { id: "cmd", label: "CMD" });
    }
    #[cfg(not(windows))]
    {
        if Path::new("/bin/zsh").exists() || Path::new("/usr/bin/zsh").exists() {
            v.push(Shell { id: "zsh", label: "zsh" });
        }
        v.push(Shell { id: "bash", label: "bash" });
    }
    v
}

#[cfg(windows)]
fn build_command(shell: &str) -> Result<CommandBuilder, String> {
    let want = if shell == "default" || shell.is_empty() { if git_bash().is_some() { "git-bash" } else { "powershell" } } else { shell };
    match want {
        "git-bash" | "bash" => {
            let p = git_bash().ok_or("Git Bash was not found. Install Git for Windows or choose another shell.")?;
            let mut c = CommandBuilder::new(p);
            c.args(["--login", "-i"]);
            Ok(c)
        }
        "cmd" => Ok(CommandBuilder::new("cmd.exe")),
        _ => {
            let mut c = CommandBuilder::new("powershell.exe");
            c.arg("-NoLogo");
            Ok(c)
        }
    }
}

#[cfg(not(windows))]
fn build_command(shell: &str) -> Result<CommandBuilder, String> {
    let want = match shell {
        "zsh" => "zsh".to_string(),
        "bash" => "bash".to_string(),
        _ => std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into()),
    };
    let mut c = CommandBuilder::new(want);
    c.arg("-l");
    Ok(c)
}

#[tauri::command]
pub fn term_spawn(app: AppHandle, terms: State<'_, Terminals>, shell: String, cwd: String) -> Result<String, String> {
    let pair = native_pty_system().openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 }).map_err(|e| e.to_string())?;
    let mut cmd = build_command(&shell)?;
    let dir = if !cwd.is_empty() && Path::new(&cwd).is_dir() {
        PathBuf::from(&cwd)
    } else {
        PathBuf::from(std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).unwrap_or_else(|_| ".".into()))
    };
    cmd.cwd(dir);
    cmd.env("TERM", "xterm-256color");
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    terms.0.lock().unwrap().insert(id.clone(), Term { master: pair.master, writer, child });

    let (eid, handle) = (id.clone(), app.clone());
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut pending: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    pending.extend_from_slice(&buf[..n]);
                    // emit only complete UTF-8 sequences; keep a split trailing sequence for the next read
                    let valid = match std::str::from_utf8(&pending) {
                        Ok(_) => pending.len(),
                        Err(e) => e.valid_up_to(),
                    };
                    let take = if valid == 0 && pending.len() > 4 { pending.len() } else { valid };
                    if take > 0 {
                        let chunk: Vec<u8> = pending.drain(..take).collect();
                        let _ = handle.emit(&format!("term://data/{eid}"), String::from_utf8_lossy(&chunk).to_string());
                    }
                }
            }
        }
        let _ = handle.emit(&format!("term://exit/{eid}"), ());
    });
    Ok(id)
}

#[tauri::command]
pub fn term_write(terms: State<'_, Terminals>, id: String, data: String) -> Result<(), String> {
    if let Some(t) = terms.0.lock().unwrap().get_mut(&id) {
        t.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        t.writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn term_resize(terms: State<'_, Terminals>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    if let Some(t) = terms.0.lock().unwrap().get(&id) {
        t.master.resize(PtySize { rows: rows.max(1), cols: cols.max(1), pixel_width: 0, pixel_height: 0 }).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn term_kill(terms: State<'_, Terminals>, id: String) -> Result<(), String> {
    if let Some(mut t) = terms.0.lock().unwrap().remove(&id) {
        let _ = t.child.kill();
    }
    Ok(())
}
