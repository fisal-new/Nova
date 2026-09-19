// Nova IDE — Rust backend (library target for desktop + Android).
// File system + search + runner + git + diagnostics.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use walkdir::WalkDir;

// ---------------------------------------------------------------------------
// NOTE (user decision, v0.7.0): all filtering removed on purpose — no
// allowlist, no arg filter, no sandbox. This device is trusted-local:
// the owner wants full power (any program, any path), like a desktop.
// The frontend still tracks the workspace root for UX only.
// ---------------------------------------------------------------------------

/// Kept as a no-op so older frontends calling `set_sandbox` don't break.
#[tauri::command]
fn set_sandbox(_root: String) -> Result<(), String> {
    Ok(())
}

/// Translate raw OS errors into actionable messages (users kept seeing
/// bare "os error 13" with no idea what to do).
fn io_err(e: std::io::Error) -> String {
    use std::io::ErrorKind::*;
    match e.kind() {
        PermissionDenied => "Access denied (os error 13): Android only grants the app its own workspace. Open the in-app workspace folder instead of /sdcard or system paths.".into(),
        NotFound => "Not found: the path doesn't exist (or the folder was moved).".into(),
        AlreadyExists => "Already exists.".into(),
        InvalidInput => format!("Invalid path: {}", e),
        _ => format!("I/O error: {}", e),
    }
}

/// Spawn failure of a tool (python3/node/git/… don't exist on phones).
/// This was the biggest source of raw "os error 2" on device.
fn spawn_err(program: &str, e: std::io::Error) -> String {
    use std::io::ErrorKind::*;
    match e.kind() {
        NotFound => format!(
            "`{}` is not installed on this device — run it on desktop, or use the in-app tools (Run button, debugger, AI).",
            program
        ),
        PermissionDenied => format!(
            "`{}` can't be launched here (os error 13). Use the in-app workspace.",
            program
        ),
        _ => format!("Couldn't start `{}`: {}", program, e),
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub children: Option<Vec<FileEntry>>,
}

/// list_dir result: entries plus whether the 3000-node mobile budget
/// cut the listing short (open subfolders directly to see the rest).
#[derive(Debug, Serialize, Deserialize)]
pub struct DirListing {
    pub entries: Vec<FileEntry>,
    pub truncated: bool,
    /// Entries we deliberately did not return: unreadable metadata,
    /// unreadable directories, broken symlinks. Shown in the UI so large
    /// projects never look silently incomplete.
    pub skipped: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchHit {
    pub path: String,
    pub line: usize,
    pub preview: String,
}

fn to_entry(
    path: &Path,
    depth: usize,
    budget: &mut usize,
    truncated: &mut bool,
    skipped: &mut usize,
) -> Option<FileEntry> {
    if *budget == 0 {
        *truncated = true;
        return None;
    }
    *budget -= 1;
    let meta = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(_) => {
            *skipped += 1;
            return None;
        }
    };
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());
    let is_dir = meta.is_dir();
    let size = if is_dir { 0 } else { meta.len() };

    let children = if is_dir && depth > 0 {
        let rd = match fs::read_dir(path) {
            Ok(rd) => rd,
            Err(_) => {
                *skipped += 1;
                return None;
            }
        };
        let mut items: Vec<FileEntry> = rd
            .filter_map(|e| e.ok())
            .filter(|e| !skip_dir_name(&e.file_name().to_string_lossy()))
            .filter_map(|e| to_entry(&e.path(), depth - 1, budget, truncated, skipped))
            .collect();
        items.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Some(items)
    } else {
        None
    };

    Some(FileEntry {
        name,
        path: path.to_string_lossy().to_string(),
        is_dir,
        size,
        children,
    })
}

/// Directories never worth expanding in a mobile file tree.
fn skip_dir_name(name: &str) -> bool {
    matches!(
        name,
        "node_modules"
            | "target"
            | "dist"
            | ".git"
            | "build"
            | ".next"
            | "__pycache__"
            | ".venv"
            | "vendor"
            | "Pods"
            | ".gradle"
    ) || name.starts_with('.')
        && matches!(name, ".cache" | ".parcel-cache" | ".turbo" | ".svn" | ".hg")
}

#[tauri::command]
fn list_dir(path: String, depth: Option<usize>) -> Result<DirListing, String> {
    let d = depth.unwrap_or(2).min(4);
    let base = PathBuf::from(&path);
    if !base.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if base.is_file() {
        let mut budget = 4;
        let mut truncated = false;
        let mut skipped = 0;
        return to_entry(&base, 0, &mut budget, &mut truncated, &mut skipped)
            .map(|e| DirListing {
                entries: vec![e],
                truncated,
                skipped,
            })
            .ok_or("read failed".into());
    }
    // mobile guard: never return more than ~3000 nodes per call
    let mut budget: usize = 3000;
    let mut truncated = false;
    let mut skipped = 0;
    let mut items: Vec<FileEntry> = fs::read_dir(&base)
        .map_err(io_err)?
        .filter_map(|e| e.ok())
        .filter(|e| !skip_dir_name(&e.file_name().to_string_lossy()))
        .filter_map(|e| to_entry(&e.path(), d, &mut budget, &mut truncated, &mut skipped))
        .collect();
    items.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(DirListing {
        entries: items,
        truncated,
        skipped,
    })
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    // refuse by metadata BEFORE reading: a 500MB file must never be fully
    // loaded into memory just to be rejected afterwards (mobile freeze).
    const LIMIT: u64 = 2_000_000;
    if let Ok(meta) = fs::metadata(&path) {
        if meta.len() > LIMIT {
            return Err(format!(
                "File too large to open on mobile ({} bytes > 2MB)",
                meta.len()
            ));
        }
    }
    let bytes = fs::read(&path).map_err(io_err)?;
    let (cow, _, _) = encoding_rs::UTF_8.decode(&bytes);
    if cow.len() > 2_000_000_usize {
        return Err("File too large to open on mobile (>2MB)".into());
    }
    Ok(cow.into_owned())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    if content.len() > 2_000_000 {
        return Err("Refusing to write >2MB from the editor".into());
    }
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(io_err)?;
        }
    }
    fs::write(&path, content).map_err(io_err)
}

#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err("File already exists".into());
    }
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(io_err)?;
        }
    }
    fs::write(&path, "").map_err(io_err)
}

#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(io_err)
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(io_err)
    } else {
        fs::remove_file(p).map_err(io_err)
    }
}

#[tauri::command]
fn rename_path(from: String, to: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&to).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(io_err)?;
        }
    }
    fs::rename(&from, &to).map_err(io_err)
}

#[tauri::command]
fn search_in_files(
    root: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<SearchHit>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let limit = max_results.unwrap_or(100).min(300);
    let mut hits = Vec::new();

    for entry in WalkDir::new(&root)
        .max_depth(6)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.')
                && name != "node_modules"
                && name != "target"
                && name != "dist"
                && name != ".git"
        })
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        if hits.len() >= limit {
            break;
        }
        if let Ok(meta) = entry.metadata() {
            if meta.len() > 500_000 {
                continue;
            }
        }
        let content = match fs::read_to_string(entry.path()) {
            Ok(c) => c,
            Err(_) => continue,
        };
        for (i, line) in content.lines().enumerate() {
            if line.contains(&query) {
                hits.push(SearchHit {
                    path: entry.path().to_string_lossy().to_string(),
                    line: i + 1,
                    preview: line.trim().chars().take(160).collect(),
                });
                if hits.len() >= limit {
                    break;
                }
            }
        }
    }
    Ok(hits)
}

/// Strip ANSI escape codes — the panel is plain text, not a PTY.
fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            match chars.peek() {
                Some('[') => {
                    chars.next();
                    for nc in chars.by_ref() {
                        if nc.is_ascii_alphabetic() {
                            break;
                        }
                    }
                }
                Some(']') => {
                    chars.next();
                    // OSC ends with BEL or with ESC \  (ST)
                    let mut prev_esc = false;
                    for nc in chars.by_ref() {
                        if nc == '\x07' {
                            break;
                        }
                        if prev_esc && nc == '\\' {
                            break;
                        }
                        prev_esc = nc == '\x1b';
                    }
                }
                Some(_) => {
                    chars.next();
                }
                None => break,
            }
        } else if c == '\r' {
            continue; // progress-bar carriage returns would smear the log
        } else {
            out.push(c);
        }
    }
    out
}

/// REMOVED (user decision, v0.7.0): the whole program/arg filter layer
/// (`ALLOWED`, `blocked_arg`, `glued_short`, `blocked_git_config`) is gone.
/// This device is trusted-local — the owner runs anything, like a desktop.

#[tauri::command]
fn run_command(
    cwd: String,
    program: String,
    args: Vec<String>,
    stdin_data: Option<String>,
) -> Result<String, String> {
    // No program/arg filtering (user decision, v0.7.0): this device is
    // trusted-local. Only the 120s watchdog + error translation remain.
    //
    // Output goes to a temp FILE, not pipes: a chatty process (>64KB, e.g.
    // long npm installs) would otherwise fill the pipe buffer and hang
    // forever, misreported as a timeout. Same fix as start_android_build.
    static OUT_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let out_path = std::env::temp_dir().join(format!(
        "nova-run-{}-{}.log",
        std::process::id(),
        OUT_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    let out_file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&out_path)
        .map_err(io_err)?;
    let err_file = out_file.try_clone().map_err(io_err)?;
    let mut child = spawn_grouped(&program)
        .args(&args)
        .current_dir(if cwd.is_empty() { "." } else { &cwd })
        .stdin(if stdin_data.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::from(out_file))
        .stderr(Stdio::from(err_file))
        .spawn()
        .map_err(|e| spawn_err(&program, e))?;
    // stdin writer runs on its own thread: writing the full input while the
    // child also streams output can no longer deadlock either side.
    let mut stdin_handle = child.stdin.take();
    // Wait with a timeout so hung servers/infinite loops can't run forever.
    // std-only: poll the child, kill on expiry. The scope block RETURNS the
    // outcome, so there is no uninitialized-variable dance for the compiler
    // or clippy to complain about.
    let timeout = Duration::from_secs(120);
    let step = Duration::from_millis(100);
    let mut waited = Duration::ZERO;
    let mut timed_out = false;
    let exit_code: Option<i32> = std::thread::scope(|s| {
        s.spawn(|| {
            if let Some(input) = stdin_data {
                if let Some(mut stdin) = stdin_handle.take() {
                    let _ = stdin.write_all(input.as_bytes());
                }
            }
        });
        loop {
            match child.try_wait() {
                Ok(Some(status)) => break status.code(),
                Ok(None) => {
                    if waited >= timeout {
                        // kill the whole tree (npm/cargo leave children behind)
                        kill_tree(child.id());
                        let _ = child.wait();
                        timed_out = true;
                        break None;
                    }
                    std::thread::sleep(step);
                    waited += step;
                }
                Err(_) => break None,
            }
        }
    });
    let mut s = std::fs::read_to_string(&out_path).unwrap_or_default();
    let _ = std::fs::remove_file(&out_path);
    if timed_out {
        s.push_str("\n(timed out after 120s — process tree killed)");
    }
    // Exit status is reported separately from stdout (never inferred from it).
    match exit_code {
        Some(0) => {
            if s.trim().is_empty() {
                s = "(command produced no output)".to_string();
            }
        }
        Some(n) => {
            if s.trim().is_empty() {
                s = format!("(exit {})", n);
            } else {
                s.push_str(&format!("\n(exit code {})", n));
            }
        }
        None => {
            if s.trim().is_empty() {
                s = "(command produced no output)".to_string();
            }
        }
    }
    // git over the terminal can't do interactive auth: say so plainly instead
    // of leaving the user staring at a bare timeout.
    if s.contains("timed out after 120s") && program == "git" {
        s.push_str("\nHint: if the remote asked for a username/password, set up a credential helper or token — interactive login isn't supported here.");
    }
    let mut s = strip_ansi(&s);
    if s.len() > 20_000 {
        s.truncate(20_000);
        s.push_str("\n… truncated");
    }
    Ok(s)
}

/// Decode a git-quoted path: `"a b"` → `a b`, octal escapes (`\303\244`)
/// → UTF-8. Plain paths pass through untouched.
fn unquote_git_path(p: &str) -> String {
    let t = p.trim();
    if !(t.starts_with('"') && t.ends_with('"') && t.len() >= 2) {
        return t.to_string();
    }
    let inner = &t[1..t.len() - 1];
    let mut out = String::with_capacity(inner.len());
    let mut bytes: Vec<u8> = Vec::with_capacity(inner.len());
    let mut chars = inner.chars().peekable();
    let flush = |bytes: &mut Vec<u8>, out: &mut String| {
        if !bytes.is_empty() {
            out.push_str(&String::from_utf8_lossy(bytes));
            bytes.clear();
        }
    };
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.peek() {
                Some('n') => {
                    flush(&mut bytes, &mut out);
                    out.push('\n');
                    chars.next();
                }
                Some('t') => {
                    flush(&mut bytes, &mut out);
                    out.push('\t');
                    chars.next();
                }
                Some('"') | Some('\\') => {
                    flush(&mut bytes, &mut out);
                    out.push(chars.next().unwrap());
                }
                Some(d) if d.is_ascii_digit() => {
                    // \ooo octal byte
                    let mut val: u32 = 0;
                    for _ in 0..3 {
                        match chars.peek() {
                            Some(d2) if d2.is_digit(8) => {
                                val = val * 8 + d2.to_digit(8).unwrap();
                                chars.next();
                            }
                            _ => break,
                        }
                    }
                    bytes.push(val as u8);
                }
                _ => {
                    flush(&mut bytes, &mut out);
                    out.push('\\');
                }
            }
        } else {
            // buffer ASCII bytes so multi-byte UTF-8 sequences survive;
            // (non-ASCII chars are pushed as-is after flushing)
            if c.is_ascii() {
                bytes.push(c as u8);
            } else {
                flush(&mut bytes, &mut out);
                out.push(c);
            }
        }
    }
    flush(&mut bytes, &mut out);
    out
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitStatus {
    pub branch: String,
    pub modified: Vec<String>,
    pub untracked: Vec<String>,
    pub staged: Vec<String>,
    pub ahead: u32,
    pub behind: u32,
    pub is_repo: bool,
}

fn git(args: &[&str], cwd: &str) -> Result<String, String> {
    git_timeout(args, cwd, 30)
}
/// Same as spawning via `run_command` but for internal git calls: bounded by
/// a timeout so a credential/gpg prompt can never hang the UI forever.
/// Output is file-backed (same pipe-deadlock class as run_command).
fn git_timeout(args: &[&str], cwd: &str, secs: u64) -> Result<String, String> {
    static GIT_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let out_path = std::env::temp_dir().join(format!(
        "nova-git-{}-{}.log",
        std::process::id(),
        GIT_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    let out_file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&out_path)
        .map_err(io_err)?;
    let err_file = out_file.try_clone().map_err(io_err)?;
    let mut child = spawn_grouped("git");
    child
        .args(args)
        .current_dir(if cwd.is_empty() { "." } else { cwd })
        .stdout(Stdio::from(out_file))
        .stderr(Stdio::from(err_file));
    let mut child = child.spawn().map_err(|e| spawn_err("git", e))?;
    let timeout = Duration::from_secs(secs);
    let step = Duration::from_millis(100);
    let mut waited = Duration::ZERO;
    let exit_code: Option<i32>;
    loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => {
                exit_code = status.code();
                break;
            }
            None => {
                if waited >= timeout {
                    kill_tree(child.id());
                    let _ = child.wait();
                    let _ = std::fs::remove_file(&out_path);
                    return Err(format!(
                        "git timed out after {}s — process tree killed",
                        secs
                    ));
                }
                std::thread::sleep(step);
                waited += step;
            }
        }
    }
    let s = std::fs::read_to_string(&out_path).unwrap_or_default();
    let _ = std::fs::remove_file(&out_path);
    // split combined log back into streams is impossible post-hoc; git writes
    // errors to stderr which we appended second — failure text still surfaces.
    if exit_code != Some(0) {
        let tail: String = s
            .lines()
            .rev()
            .take(5)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("\n");
        return Err(if tail.trim().is_empty() {
            format!("git exited with code {:?}", exit_code)
        } else {
            tail.trim().to_string()
        });
    }
    Ok(s)
}

/// Parse `git status --porcelain=v1 -z` output. Returns
/// (modified, untracked, staged). Pure function — unit tested.
/// NUL is written as unicode escape to keep editors/linters calm.
fn parse_porcelain_z(porcelain: &str) -> (Vec<String>, Vec<String>, Vec<String>) {
    let mut modified = vec![];
    let mut untracked = vec![];
    let mut staged = vec![];
    let mut records = porcelain.split('\u{0}').peekable();
    while let Some(rec) = records.next() {
        if rec.len() < 4 {
            continue;
        }
        let mut chars = rec.chars();
        let x = chars.next().unwrap_or(' ');
        let y = chars.next().unwrap_or(' ');
        let mut path = rec[3..].trim().to_string();
        // renames/copies carry a second record with the NEW path
        if (x == 'R' || x == 'C' || y == 'R' || y == 'C') && records.peek().is_some() {
            path = records.next().unwrap_or_default().trim().to_string();
        }
        let path = unquote_git_path(&path);
        if x == '?' && y == '?' {
            untracked.push(path);
        } else {
            if x != ' ' {
                staged.push(path.clone());
            }
            if y != ' ' {
                modified.push(path);
            }
        }
    }
    (modified, untracked, staged)
}

#[tauri::command]
fn git_status(cwd: String) -> Result<GitStatus, String> {
    // (no sandbox — trusted local device, see top of file)
    if git(&["rev-parse", "--git-dir"], &cwd).is_err() {
        return Ok(GitStatus {
            branch: String::new(),
            modified: vec![],
            untracked: vec![],
            staged: vec![],
            ahead: 0,
            behind: 0,
            is_repo: false,
        });
    }
    let branch = git(&["branch", "--show-current"], &cwd)
        .unwrap_or_default()
        .trim()
        .to_string();
    let porcelain = git(&["status", "--porcelain=v1", "-z"], &cwd).unwrap_or_default();
    // ahead/behind vs upstream (0/0 when no upstream is configured)
    let (ahead, behind) = git(
        &["rev-list", "--left-right", "--count", "@{u}...HEAD"],
        &cwd,
    )
    .ok()
    .and_then(|s| {
        let mut it = s.split_whitespace();
        let behind = it.next()?.parse::<u32>().ok()?;
        let ahead = it.next()?.parse::<u32>().ok()?;
        Some((ahead, behind))
    })
    .unwrap_or((0, 0));
    // NUL-separated records (path, or orig/new pair for renames).
    let (modified, untracked, staged) = parse_porcelain_z(&porcelain);
    Ok(GitStatus {
        branch: if branch.is_empty() {
            "HEAD".into()
        } else {
            branch
        },
        modified,
        untracked,
        staged,
        ahead,
        behind,
        is_repo: true,
    })
}

#[tauri::command]
fn git_diff(cwd: String, path: Option<String>, staged: Option<bool>) -> Result<String, String> {
    // (no sandbox — trusted local device, see top of file)
    let target = path.as_deref().unwrap_or(".");
    let owned = target.to_string();
    let args: Vec<&str> = if staged.unwrap_or(false) {
        vec!["diff", "--cached", "--no-color", "--", &owned]
    } else {
        vec!["diff", "--no-color", "--", &owned]
    };
    let s = git(&args, &cwd)?;
    Ok(s.chars().take(30_000).collect())
}

#[tauri::command]
fn git_checkout(cwd: String, branch: String) -> Result<String, String> {
    // (no sandbox — trusted local device, see top of file)
    let b = branch.trim();
    // reject flags disguised as branch names (e.g. "--force", "-b")
    if b.is_empty()
        || b.starts_with('-')
        || b.contains(|c: char| c.is_whitespace() || c == ';' || c == '&' || c == '|')
    {
        return Err("invalid branch name".into());
    }
    git(&["checkout", b], &cwd)
}

#[tauri::command]
fn git_commit(cwd: String, message: String, add_all: Option<bool>) -> Result<String, String> {
    // (no sandbox — trusted local device, see top of file)
    let message = message.trim().to_string();
    if message.is_empty() {
        return Err("Commit message is empty".into());
    }
    if message.chars().count() > 2000 {
        return Err("Commit message too long (2000 chars max)".into());
    }
    if add_all.unwrap_or(true) {
        let _ = git(&["add", "-A"], &cwd);
    }
    git(&["commit", "-m", &message], &cwd)
}

#[tauri::command]
fn git_branches(cwd: String) -> Result<Vec<String>, String> {
    // (no sandbox — trusted local device, see top of file)
    let s = git(&["branch", "--format=%(refname:short)"], &cwd).unwrap_or_default();
    Ok(s.lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect())
}

#[tauri::command]
fn git_log(cwd: String, limit: Option<u32>) -> Result<Vec<GitCommit>, String> {
    // (no sandbox — trusted local device, see top of file)
    let n = limit.unwrap_or(30).min(100).to_string();
    let fmt = "--pretty=format:%H%x1f%an%x1f%ad%x1f%s".to_string();
    let s = git(&["log", &format!("-{}", n), &fmt, "--date=short"], &cwd).unwrap_or_default();
    let mut out = vec![];
    for line in s.lines() {
        let parts: Vec<&str> = line.split('\x1f').collect();
        if parts.len() >= 4 {
            out.push(GitCommit {
                hash: parts[0][..7.min(parts[0].len())].to_string(),
                author: parts[1].to_string(),
                date: parts[2].to_string(),
                message: parts[3].to_string(),
            });
        }
    }
    Ok(out)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitCommit {
    pub hash: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Diagnostic {
    pub line: usize,
    pub col: usize,
    pub severity: String,
    pub message: String,
}

#[tauri::command]
fn analyze_file(path: String, content: Option<String>) -> Result<Vec<Diagnostic>, String> {
    let text = match content {
        Some(c) => c,
        None => fs::read_to_string(&path).unwrap_or_default(),
    };
    let mut diags = vec![];
    for (i, line) in text.lines().enumerate().take(5000) {
        let ln = i + 1;
        // character count, not bytes: Arabic/CJK text is 2-4 bytes per char
        let len = line.chars().count();
        if len > 200 {
            diags.push(Diagnostic {
                line: ln,
                col: 201,
                severity: "warning".into(),
                message: format!("Line too long ({} chars)", len),
            });
        }
        let trimmed_len = line.trim_end().chars().count();
        if trimmed_len != len {
            diags.push(Diagnostic {
                line: ln,
                col: trimmed_len + 1,
                severity: "info".into(),
                message: "Trailing whitespace".into(),
            });
        }
        for kw in ["TODO", "FIXME", "XXX", "HACK"] {
            if let Some(col) = line.find(kw) {
                diags.push(Diagnostic {
                    line: ln,
                    col: col + 1,
                    severity: "info".into(),
                    message: format!("{} marker", kw),
                });
                break;
            }
        }
        if diags.len() > 200 {
            break;
        }
    }
    Ok(diags)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BuildStatus {
    pub running: bool,
    pub started_at: String,
    pub exit_code: Option<i32>,
    pub apk_path: Option<String>,
    pub tail: Vec<String>,
}

static APK_BUILD: Mutex<BuildState> = Mutex::new(BuildState {
    running: false,
    pid: None,
    cancelled: false,
    log_path: None,
    exit_code: None,
    started_at: None,
});

struct BuildState {
    running: bool,
    pid: Option<u32>,
    cancelled: bool,
    log_path: Option<PathBuf>,
    exit_code: Option<i32>,
    started_at: Option<String>,
}

/// Kill a whole process TREE, not just the direct child: shell/npm/cargo
/// routinely leave descendants running otherwise. Children are spawned as
/// process-group leaders (see spawn_grouped), so a negative pid reaches all.
fn kill_tree(pid: u32) {
    #[cfg(unix)]
    {
        // SAFETY: kill(2) with SIGKILL has no memory effects; pid comes from
        // our own spawned child, group id == pid by construction.
        unsafe { libc::kill(-(pid as libc::pid_t), libc::SIGKILL) };
    }
    #[cfg(windows)]
    {
        // /T = terminate the process tree rooted at pid
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output();
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = pid;
    }
}

/// Spawn with the child as its own process-group leader so kill_tree can
/// reap descendants too. (Windows: groups are handled by taskkill /T.)
fn spawn_grouped(program: &str) -> Command {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        let mut cmd = Command::new(program);
        cmd.process_group(0);
        cmd
    }
    #[cfg(not(unix))]
    {
        Command::new(program)
    }
}

fn now_stamp() -> String {
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(d) => format!("{}", d.as_secs()),
        Err(_) => String::new(),
    }
}

fn apk_log_path() -> PathBuf {
    std::env::temp_dir().join("nova-apk-build.log")
}

/// Unique log per build + retention: a later build must never show the
/// previous build's tail or detect its APK path (old fixed-name bug).
fn apk_log_path_for(id: &str) -> PathBuf {
    std::env::temp_dir().join(format!("nova-apk-build-{}.log", id))
}

fn prune_apk_logs() {
    // Retention: keep the 2 newest existing logs; the build starting now
    // gets a fresh file, so at most 3 ever accumulate.
    let tmp = std::env::temp_dir();
    let mut logs: Vec<(std::time::SystemTime, PathBuf)> = vec![];
    if let Ok(rd) = std::fs::read_dir(&tmp) {
        for e in rd.filter_map(|e| e.ok()) {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with("nova-apk-build-") && name.ends_with(".log") {
                let mtime = e
                    .metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::UNIX_EPOCH);
                logs.push((mtime, e.path()));
            }
        }
    }
    logs.sort_by_key(|(t, _)| *t);
    let drop_n = logs.len().saturating_sub(2);
    for (_, p) in logs.into_iter().take(drop_n) {
        let _ = std::fs::remove_file(p);
    }
}

/// Find the Nova project root (folder containing src-tauri/tauri.conf.json)
/// by walking up from the backend cwd and the executable location.
/// `npx tauri android build` must run there, not in some random cwd.
fn find_project_root() -> Option<PathBuf> {
    let mut cands: Vec<PathBuf> = vec![];
    if let Ok(cwd) = std::env::current_dir() {
        cands.push(cwd);
    }
    if let Ok(exe) = std::env::current_exe() {
        let mut d = exe.clone();
        for _ in 0..6 {
            if d.pop() {
                cands.push(d.clone());
            }
        }
    }
    for base in cands {
        let mut d = base;
        for _ in 0..5 {
            if d.join("src-tauri").join("tauri.conf.json").exists() {
                return Some(d);
            }
            if !d.pop() {
                break;
            }
        }
    }
    None
}

/// Start an Android debug APK build in the background (needs Android SDK +
/// NDK + Rust targets on the machine running the backend — i.e. a dev
/// machine, not a phone). Returns immediately; poll with `poll_android_build`.
#[tauri::command]
fn start_android_build(target: Option<String>) -> Result<String, String> {
    let mut st = APK_BUILD.lock().map_err(|e| e.to_string())?;
    if st.running {
        return Err("a build is already running — poll it first".into());
    }
    let target = target.unwrap_or_else(|| "aarch64".into());
    let build_id = format!("{}-{}", now_stamp(), target);
    prune_apk_logs();
    let log_path = apk_log_path_for(&build_id);
    if !["aarch64", "armv7", "x86_64", "i686"].contains(&target.as_str()) {
        return Err("invalid target (aarch64|armv7|x86_64|i686)".into());
    }
    // best-effort SDK discovery for common install locations
    let home = std::env::var("HOME").unwrap_or_default();
    for cand in [
        std::env::var("ANDROID_HOME").unwrap_or_default(),
        format!("{}/android-sdk", home),
        format!("{}/Android/Sdk", home),
        "/opt/android-sdk".to_string(),
        "/usr/lib/android-sdk".to_string(),
    ] {
        if !cand.is_empty()
            && PathBuf::from(&cand).join("platform-tools").exists()
            && std::env::var("ANDROID_HOME").unwrap_or_default().is_empty()
        {
            std::env::set_var("ANDROID_HOME", &cand);
            std::env::set_var("ANDROID_SDK_ROOT", &cand);
        }
    }
    if std::env::var("ANDROID_HOME").unwrap_or_default().is_empty() {
        return Err("no Android SDK found — install it or set ANDROID_HOME (on-device phones can't build APKs)".into());
    }
    let log_clone = log_path.clone();
    let target_msg = target.clone();
    st.running = true;
    st.pid = None;
    st.cancelled = false;
    st.log_path = Some(log_path.clone());
    st.exit_code = None;
    st.started_at = Some(now_stamp());
    drop(st);

    std::thread::spawn(move || {
        // Stream straight to the log file: no pipes, so big Gradle output
        // can never deadlock us, and polling shows live progress.
        // (Single append-mode handle, cloned for stderr — separate truncating
        // opens would wipe each other's bytes.)
        let log_file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_clone);
        let finish = |code: Option<i32>, note: &str| {
            if let Ok(mut st) = APK_BUILD.lock() {
                st.running = false;
                st.pid = None;
                st.exit_code = code;
            }
            if !note.is_empty() {
                if let Ok(existing) = fs::read_to_string(&log_clone) {
                    let _ = fs::write(&log_clone, format!("{}{}\n", existing, note));
                }
            }
        };
        let mut child = match (|| -> Result<std::process::Child, std::io::Error> {
            let f = log_file?;
            let f2 = f.try_clone()?;
            let mut cmd = spawn_grouped("npx");
            cmd.args([
                "tauri", "android", "build", "--debug", "--apk", "-t", &target,
            ])
            .current_dir(find_project_root().unwrap_or_else(|| PathBuf::from(".")))
            .stdout(Stdio::from(f))
            .stderr(Stdio::from(f2));
            cmd.spawn()
        })() {
            Ok(c) => c,
            Err(e) => {
                let _ = fs::write(&log_clone, spawn_err("npx (Android build tools)", e));
                finish(Some(-1), "");
                return;
            }
        };
        if let Ok(mut st) = APK_BUILD.lock() {
            st.pid = Some(child.id());
        }
        // 30-minute ceiling: hung Gradle/NDK can no longer lock builds forever.
        let timeout = Duration::from_secs(1800);
        let step = Duration::from_millis(500);
        let mut waited = Duration::ZERO;
        let outcome: Option<i32> = loop {
            let cancelled = APK_BUILD.lock().map(|st| st.cancelled).unwrap_or(false);
            if cancelled {
                kill_tree(child.id());
                let _ = child.wait();
                finish(None, "cancelled by user");
                return;
            }
            match child.try_wait() {
                Ok(Some(status)) => break status.code(),
                Ok(None) => {
                    if waited >= timeout {
                        kill_tree(child.id());
                        let _ = child.wait();
                        finish(
                            Some(-2),
                            "TIMED OUT after 30min — killed. Common causes: NDK download on first run, or Gradle waiting on network.",
                        );
                        return;
                    }
                    std::thread::sleep(step);
                    waited += step;
                }
                Err(_) => break None,
            }
        };
        finish(outcome, "");
    });
    Ok(format!(
        "build started (target {}) — log: {}",
        target_msg,
        log_path.to_string_lossy()
    ))
}

/// Cancel a running APK build (the timeout path and the user button share it).
/// Never locks forever: only flips flags, the worker thread finalizes.
#[tauri::command]
fn cancel_android_build() -> Result<String, String> {
    let mut st = APK_BUILD.lock().map_err(|e| e.to_string())?;
    if !st.running {
        return Ok("no build running".into());
    }
    st.cancelled = true;
    if let Some(pid) = st.pid {
        kill_tree(pid);
    }
    Ok("cancel requested — poll to confirm it stopped".into())
}

/// Poll the background APK build: running flag, exit code, detected APK path
/// plus the last ~30 log lines (ANSI-stripped for the plain-text panel).
#[tauri::command]
fn poll_android_build() -> Result<BuildStatus, String> {
    let st = APK_BUILD.lock().map_err(|e| e.to_string())?;
    let log_path = st.log_path.clone().unwrap_or_else(apk_log_path);
    let content = fs::read_to_string(&log_path).unwrap_or_default();
    let lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();
    let tail: Vec<String> = lines
        .iter()
        .rev()
        .take(30)
        .map(|l| strip_ansi(l))
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    // find a real APK path mentioned in the log ("...Finished N APK at:\n  /path/x.apk")
    let mut apk_path: Option<String> = None;
    for line in lines.iter().rev() {
        let t = line.trim();
        if t.ends_with(".apk") && PathBuf::from(t).exists() {
            apk_path = Some(t.to_string());
            break;
        }
        // gradle-style: "app-universal-debug.apk" relative mentions are skipped
    }
    Ok(BuildStatus {
        running: st.running,
        started_at: st.started_at.clone().unwrap_or_default(),
        exit_code: st.exit_code,
        apk_path,
        tail,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_permissions::init())
        .invoke_handler(tauri::generate_handler![
            set_sandbox,
            list_dir,
            read_file,
            write_file,
            create_file,
            create_dir,
            delete_path,
            rename_path,
            search_in_files,
            run_command,
            git_status,
            git_diff,
            git_checkout,
            git_commit,
            git_branches,
            git_log,
            analyze_file,
            start_android_build,
            cancel_android_build,
            poll_android_build
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nova IDE");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_filesystem_roundtrip() {
        // v0.7.0: no filters — any path works, like a desktop
        let root = std::env::temp_dir().join("nova-open-test");
        let _ = fs::remove_dir_all(&root);
        let p = root.join("sub").join("a.txt");
        create_dir(root.join("sub").to_string_lossy().to_string()).unwrap();
        write_file(p.to_string_lossy().to_string(), "hello".into()).unwrap();
        assert_eq!(read_file(p.to_string_lossy().to_string()).unwrap(), "hello");
        rename_path(
            p.to_string_lossy().to_string(),
            root.join("sub").join("b.txt").to_string_lossy().to_string(),
        )
        .unwrap();
        delete_path(root.join("sub").join("b.txt").to_string_lossy().to_string()).unwrap();
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn ansi_stripped_but_text_kept() {
        assert_eq!(strip_ansi("\x1b[31mred\x1b[0m ok"), "red ok");
        assert_eq!(strip_ansi("a\rb"), "ab");
        // OSC terminated by BEL
        assert_eq!(strip_ansi("\x1b]0;title\x07hi"), "hi");
        // OSC terminated by ESC backslash (ST)
        assert_eq!(strip_ansi("\x1b]0;title\x1b\\hi"), "hi");
        assert_eq!(strip_ansi("plain"), "plain");
    }

    #[test]
    fn read_refuses_big_files_before_loading() {
        let root = std::env::temp_dir().join("nova-sizecheck-test");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        // 3MB of zeroes: must be refused by metadata, not loaded
        let big = root.join("big.bin");
        fs::write(&big, vec![0u8; 3_000_000]).unwrap();
        let err = read_file(big.to_string_lossy().to_string()).unwrap_err();
        assert!(err.contains("2MB"), "unexpected: {}", err);
        // small file still opens
        let small = root.join("small.txt");
        fs::write(&small, "hi").unwrap();
        assert_eq!(
            read_file(small.to_string_lossy().to_string()).unwrap(),
            "hi"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn porcelain_z_handles_renames_and_quotes() {
        let nul = '\u{0}';
        // M = modified file, ?? = untracked, R = rename orig->new, quoted name
        let sample = format!(
            " M src/a.rs{nul}?? new.txt{nul}R  old.rs{nul}new.rs{nul}\"my file.txt\"{nul}",
        );
        let (modified, untracked, staged) = parse_porcelain_z(&sample);
        assert!(modified.contains(&"src/a.rs".to_string()), "{:?}", modified);
        assert!(
            untracked.contains(&"new.txt".to_string()),
            "{:?}",
            untracked
        );
        assert!(staged.contains(&"new.rs".to_string()), "{:?}", staged);
        assert!(!staged.iter().any(|p| p == "old.rs"), "{:?}", staged);
        let (m2, _, _) = parse_porcelain_z(&format!(" M \"my file.txt\"{nul}"));
        assert!(m2.contains(&"my file.txt".to_string()), "{:?}", m2);
        // octal-escaped unicode name decodes
        let (m3, _, _) = parse_porcelain_z(&format!(" M \"\\303\\244bc\"{nul}"));
        assert!(m3.contains(&"äbc".to_string()), "{:?}", m3);
    }

    #[test]
    fn skip_dirs_cover_heavy_trees() {
        for d in [
            "node_modules",
            "target",
            "dist",
            ".git",
            "__pycache__",
            ".venv",
        ] {
            assert!(skip_dir_name(d), "{}", d);
        }
        assert!(!skip_dir_name("src"));
        assert!(!skip_dir_name(".github"));
    }

    #[test]
    fn big_output_does_not_hang_or_time_out() {
        // ~109KB of output would fill a 64KB pipe and deadlock the old code;
        // file-backed output must stream it through, cap at 20KB, and report
        // success (the tail number 20000 is correctly cut by the cap).
        let out = run_command(
            String::new(),
            "sh".into(),
            vec!["-c".into(), "seq 1 20000".into()],
            None,
        )
        .expect("run_command failed");
        assert!(out.contains("\n1000\n"), "early output missing");
        assert!(out.contains("… truncated"), "cap marker missing");
        assert!(!out.contains("timed out"), "falsely reported as timeout");
    }
}
