//! SSH tunnel through the system `ssh` client. Authentication uses the user's ssh-agent / keys
//! (BatchMode: no prompts), so private keys and passphrases never pass through this app.

use std::net::{TcpListener, TcpStream};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

pub struct Tunnel {
    pub local_port: u16,
    child: Child,
}

impl Drop for Tunnel {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn free_port() -> Result<u16, String> {
    let l = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    Ok(l.local_addr().map_err(|e| e.to_string())?.port())
}

fn sane(s: &str) -> bool {
    !s.is_empty() && !s.starts_with('-') && s.chars().all(|c| c.is_ascii_alphanumeric() || "._-@:".contains(c))
}

pub fn open(ssh_host: &str, ssh_port: u16, ssh_user: &str, db_host: &str, db_port: u16) -> Result<Tunnel, String> {
    if !sane(ssh_host) || !sane(db_host) || (!ssh_user.is_empty() && !sane(ssh_user)) {
        return Err("Invalid SSH tunnel settings".into());
    }
    let local = free_port()?;
    let target = if ssh_user.is_empty() { ssh_host.to_string() } else { format!("{ssh_user}@{ssh_host}") };
    let mut cmd = Command::new("ssh");
    cmd.args(["-N", "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes", "-o", "StrictHostKeyChecking=accept-new", "-p"])
        .arg(ssh_port.to_string())
        .arg("-L")
        .arg(format!("127.0.0.1:{local}:{db_host}:{db_port}"))
        .arg(target)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn().map_err(|e| format!("Could not start the system 'ssh' client: {e}"))?;
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!("SSH tunnel exited early ({status}). Check that your SSH key is loaded in ssh-agent and the host is reachable."));
        }
        if TcpStream::connect_timeout(&format!("127.0.0.1:{local}").parse().unwrap(), Duration::from_millis(200)).is_ok() {
            return Ok(Tunnel { local_port: local, child });
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    let _ = child.kill();
    Err("Timed out opening the SSH tunnel".into())
}
