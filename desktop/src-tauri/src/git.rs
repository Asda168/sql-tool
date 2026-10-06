//! Git integration through the system `git` executable (the same Git that powers Git Bash).
//! Prompts are disabled so a missing credential fails fast instead of hanging; credentials come from
//! the user's credential helper or SSH agent and are never seen by this app.

use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Serialize)]
pub struct Change {
    path: String,
    index: String,
    worktree: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    is_repo: bool,
    branch: String,
    ahead: u32,
    behind: u32,
    changes: Vec<Change>,
}

#[derive(Serialize)]
pub struct Commit {
    hash: String,
    author: String,
    date: String,
    message: String,
}

#[derive(Serialize)]
pub struct Branch {
    name: String,
    current: bool,
    remote: bool,
}

#[derive(Serialize)]
pub struct Remote {
    name: String,
    url: String,
}

fn git(cwd: &str, args: &[&str]) -> Result<String, String> {
    let mut c = Command::new("git");
    c.args(args).current_dir(cwd).env("GIT_TERMINAL_PROMPT", "0").env("LC_ALL", "C");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
    }
    let out = c.output().map_err(|e| format!("Could not run git (is Git installed and on PATH?): {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(if err.is_empty() { String::from_utf8_lossy(&out.stdout).trim().to_string() } else { err })
    }
}

/// Reject values that git could interpret as options.
fn safe_ref(v: &str) -> Result<&str, String> {
    if v.is_empty() || v.starts_with('-') || v.contains("..") || v.chars().any(|c| c.is_whitespace() || c.is_control() || "~^:?*[\\".contains(c)) {
        return Err(format!("Invalid name: {v}"));
    }
    Ok(v)
}

#[tauri::command]
pub fn git_status(cwd: String) -> Result<Status, String> {
    if git(&cwd, &["rev-parse", "--is-inside-work-tree"]).map(|s| s.trim() == "true") != Ok(true) {
        return Ok(Status { is_repo: false, branch: String::new(), ahead: 0, behind: 0, changes: vec![] });
    }
    let out = git(&cwd, &["status", "--porcelain=v1", "-b", "-uall"])?;
    let (mut branch, mut ahead, mut behind, mut changes) = (String::new(), 0, 0, Vec::new());
    for line in out.lines() {
        if let Some(h) = line.strip_prefix("## ") {
            let name = h.split(|c| c == '.' || c == ' ').next().unwrap_or("");
            branch = h.strip_prefix("No commits yet on ").unwrap_or(name).to_string();
            if let (Some(a), Some(b)) = (h.find('['), h.find(']')) {
                for part in h[a + 1..b].split(", ") {
                    if let Some(n) = part.strip_prefix("ahead ") {
                        ahead = n.parse().unwrap_or(0);
                    }
                    if let Some(n) = part.strip_prefix("behind ") {
                        behind = n.parse().unwrap_or(0);
                    }
                }
            }
        } else if line.len() > 3 {
            let (x, y) = (&line[0..1], &line[1..2]);
            let mut path = line[3..].to_string();
            if let Some(i) = path.find(" -> ") {
                path = path[i + 4..].to_string();
            }
            changes.push(Change { path: path.trim_matches('"').to_string(), index: x.to_string(), worktree: y.to_string() });
        }
    }
    Ok(Status { is_repo: true, branch, ahead, behind, changes })
}

fn with_paths(cwd: &str, head: &[&str], paths: &[String]) -> Result<String, String> {
    let mut a: Vec<&str> = head.to_vec();
    a.push("--");
    a.extend(paths.iter().map(|s| s.as_str()));
    git(cwd, &a)
}

#[tauri::command]
pub fn git_stage(cwd: String, paths: Vec<String>) -> Result<(), String> {
    with_paths(&cwd, &["add", "-A"], &paths).map(|_| ())
}

#[tauri::command]
pub fn git_unstage(cwd: String, paths: Vec<String>) -> Result<(), String> {
    with_paths(&cwd, &["restore", "--staged"], &paths).or_else(|_| with_paths(&cwd, &["rm", "--cached", "-r", "-q"], &paths)).map(|_| ())
}

#[tauri::command]
pub fn git_commit(cwd: String, message: String) -> Result<(), String> {
    if message.trim().is_empty() {
        return Err("Commit message is empty".into());
    }
    git(&cwd, &["commit", "-m", &message]).map(|_| ())
}

#[tauri::command]
pub fn git_branches(cwd: String) -> Result<Vec<Branch>, String> {
    let out = git(&cwd, &["branch", "-a", "--format=%(HEAD)|%(refname:short)"])?;
    Ok(out
        .lines()
        .filter_map(|l| {
            let (h, n) = l.split_once('|')?;
            if n.ends_with("/HEAD") || n.contains("HEAD detached") {
                return None;
            }
            Some(Branch { name: n.to_string(), current: h == "*", remote: n.contains('/') && n.starts_with("origin/") })
        })
        .collect())
}

#[tauri::command]
pub fn git_checkout(cwd: String, branch: String) -> Result<(), String> {
    git(&cwd, &["checkout", safe_ref(&branch)?]).map(|_| ())
}

#[tauri::command]
pub fn git_create_branch(cwd: String, name: String) -> Result<(), String> {
    git(&cwd, &["checkout", "-b", safe_ref(&name)?]).map(|_| ())
}

#[tauri::command]
pub fn git_log(cwd: String, limit: u32, path: Option<String>) -> Result<Vec<Commit>, String> {
    let n = format!("-n{}", limit.clamp(1, 500));
    let mut args = vec!["log", &n, "--format=%H%x1f%an%x1f%aI%x1f%s"];
    let p;
    if let Some(x) = &path {
        p = x.clone();
        args.push("--");
        args.push(&p);
    }
    let out = git(&cwd, &args).unwrap_or_default(); // no commits yet -> empty history
    Ok(out
        .lines()
        .filter_map(|l| {
            let mut it = l.split('\u{1f}');
            Some(Commit { hash: it.next()?.to_string(), author: it.next()?.to_string(), date: it.next()?.to_string(), message: it.next()?.to_string() })
        })
        .collect())
}

#[tauri::command]
pub fn git_diff(cwd: String, path: String, staged: bool) -> Result<String, String> {
    let mut args = vec!["diff", "--no-color"];
    if staged {
        args.push("--cached");
    }
    args.push("--");
    args.push(&path);
    let d = git(&cwd, &args)?;
    if d.trim().is_empty() && !staged {
        // untracked file: show it as an addition
        let full = Path::new(&cwd).join(&path);
        if let Ok(t) = std::fs::read_to_string(full) {
            return Ok(format!("--- /dev/null\n+++ b/{path}\n{}", t.lines().map(|l| format!("+{l}")).collect::<Vec<_>>().join("\n")));
        }
    }
    Ok(d)
}

#[tauri::command]
pub fn git_remotes(cwd: String) -> Result<Vec<Remote>, String> {
    let out = git(&cwd, &["remote", "-v"])?;
    let mut v: Vec<Remote> = Vec::new();
    for l in out.lines() {
        let mut it = l.split_whitespace();
        if let (Some(n), Some(u)) = (it.next(), it.next()) {
            if !v.iter().any(|r| r.name == n) {
                v.push(Remote { name: n.to_string(), url: u.to_string() });
            }
        }
    }
    Ok(v)
}

#[tauri::command]
pub fn git_run(cwd: String, op: String, arg: Option<String>) -> Result<String, String> {
    let out = match op.as_str() {
        "pull" => git(&cwd, &["pull", "--ff-only"]),
        "push" => git(&cwd, &["push"]),
        "fetch" => git(&cwd, &["fetch", "--all", "--prune"]),
        "stash" => git(&cwd, &["stash", "push", "-u"]),
        "stash-pop" => git(&cwd, &["stash", "pop"]),
        "merge" => git(&cwd, &["merge", safe_ref(arg.as_deref().unwrap_or(""))?]),
        "rebase" => git(&cwd, &["rebase", safe_ref(arg.as_deref().unwrap_or(""))?]),
        _ => Err(format!("Unsupported git operation: {op}")),
    }?;
    Ok(out.trim().to_string())
}

#[tauri::command]
pub fn git_clone(url: String, dest: String) -> Result<String, String> {
    if url.starts_with('-') || !(url.starts_with("https://") || url.starts_with("git@") || url.starts_with("ssh://")) {
        return Err("Use an https://, ssh:// or git@host:path URL.".into());
    }
    if Path::new(&dest).exists() {
        return Err("The destination folder already exists.".into());
    }
    let parent = Path::new(&dest).parent().ok_or("Invalid destination")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    git(parent.to_str().ok_or("Invalid destination")?, &["clone", "--", &url, &dest]).map(|s| s.trim().to_string())
}

#[tauri::command]
pub fn git_init(cwd: String) -> Result<(), String> {
    git(&cwd, &["init", "-b", "main"]).or_else(|_| git(&cwd, &["init"])).map(|_| ())
}
