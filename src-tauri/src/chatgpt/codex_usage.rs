//! Read account metadata and quota via Codex's local stdio RPC. No threads,
//! inference, shared token files, or credentials pass through MondoWrite.
use super::{Result, vault};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{path::PathBuf, process::Stdio, time::Duration};
use tauri::AppHandle;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines},
    process::{ChildStdout, Command},
};

#[derive(Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    Read,
    Preview,
    Connect,
    Disconnect,
}
#[derive(Default, Serialize)]
pub struct Snapshot {
    connected: bool,
    workspace: Option<String>,
    label: Option<String>,
    windows: Vec<Window>,
}
#[derive(Serialize)]
struct Window {
    percent: f64,
    reset: Option<u64>,
}

async fn reply(lines: &mut Lines<BufReader<ChildStdout>>, id: u8) -> Result<Value> {
    loop {
        let line = lines
            .next_line()
            .await
            .map_err(|_| "codexError")?
            .ok_or("codexError")?;
        let value: Value = serde_json::from_str(&line).map_err(|_| "codexError")?;
        if value["id"] == id {
            return value
                .get("result")
                .cloned()
                .ok_or_else(|| "codexError".into());
        }
    }
}

fn executable() -> PathBuf {
    #[cfg(target_os = "macos")]
    for path in [
        "/opt/homebrew/bin/codex",
        "/usr/local/bin/codex",
        "/Applications/Codex.app/Contents/Resources/codex",
    ] {
        if std::path::Path::new(path).is_file() {
            return path.into();
        }
    }
    "codex".into()
}

async fn fetch(action: &Action, email: &str, expected: Option<&str>) -> Result<Snapshot> {
    let mut command = Command::new(executable());
    command
        .args(["app-server", "--listen", "stdio://"])
        .current_dir(std::env::temp_dir())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let mut child = command.spawn().map_err(|_| "codexMissing")?;
    let mut input = child.stdin.take().ok_or("codexError")?;
    let mut lines = BufReader::new(child.stdout.take().ok_or("codexError")?).lines();
    let init = json!({"method":"initialize","id":1,"params":{"clientInfo":{"name":"mondowrite","title":"MondoWrite","version":env!("CARGO_PKG_VERSION")},"capabilities":{"experimentalApi":true}}});
    input
        .write_all(format!("{init}\n").as_bytes())
        .await
        .map_err(|_| "codexError")?;
    reply(&mut lines, 1).await?;
    input.write_all(b"{\"method\":\"initialized\"}\n{\"method\":\"account/read\",\"id\":2,\"params\":{\"refreshToken\":false}}\n").await.map_err(|_|"codexError")?;
    let who = reply(&mut lines, 2).await?;
    let account = &who["account"];
    if account["type"] != "chatgpt"
        || email.is_empty()
        || !account["email"]
            .as_str()
            .is_some_and(|e| e.eq_ignore_ascii_case(email))
    {
        return Err("codexMismatch".into());
    }
    let workspace = who["workspaceRouting"]["chatgptAccountId"]
        .as_str()
        .filter(|id| !id.is_empty())
        .ok_or("codexWorkspace")?;
    if expected.is_some_and(|id| id != workspace) {
        return Err("codexMismatch".into());
    }
    let mut snapshot = Snapshot {
        workspace: Some(workspace.into()),
        label: Some(format!(
            "{} · {}",
            email,
            account["workspaceName"]
                .as_str()
                .filter(|s| !s.is_empty())
                .unwrap_or(workspace)
        )),
        ..Default::default()
    };
    if *action != Action::Preview {
        input.write_all(b"{\"method\":\"account/rateLimits/read\",\"id\":3,\"params\":{\"excludeResetCreditDetails\":true}}\n").await.map_err(|_|"codexError")?;
        let limits = reply(&mut lines, 3).await?;
        let limits = &limits["rateLimits"];
        for key in ["primary", "secondary"] {
            if let Some(percent) = limits[key]["usedPercent"]
                .as_f64()
                .filter(|p| (0.0..=100.0).contains(p))
            {
                snapshot.windows.push(Window {
                    percent,
                    reset: limits[key]["resetsAt"].as_u64(),
                });
            }
        }
        if snapshot.windows.is_empty() {
            return Err("codexError".into());
        }
        // Codex can switch workspaces while a network request is pending.
        input
            .write_all(
                b"{\"method\":\"account/read\",\"id\":4,\"params\":{\"refreshToken\":false}}\n",
            )
            .await
            .map_err(|_| "codexError")?;
        let after = reply(&mut lines, 4).await?;
        if after["workspaceRouting"]["chatgptAccountId"] != workspace
            || after["account"]["email"] != account["email"]
        {
            return Err("codexMismatch".into());
        }
        snapshot.connected = true;
    }
    Ok(snapshot)
}

#[tauri::command]
pub async fn codex_usage(
    app: AppHandle,
    action: Action,
    workspace: Option<String>,
) -> Result<Snapshot> {
    let account = {
        let _guard = vault::lock(&app).await?;
        let mut account = vault::load().await?.ok_or("auth")?;
        if action == Action::Disconnect {
            account.usage_workspace = None;
            vault::save(&account).await?;
            return Ok(Snapshot::default());
        }
        account
    };
    if !account.granted() {
        return Err("auth".into());
    }
    let expected = match action {
        Action::Read if account.usage_workspace.is_none() => return Ok(Snapshot::default()),
        Action::Read => account.usage_workspace.as_deref(),
        Action::Connect => Some(workspace.as_deref().ok_or("codexWorkspace")?),
        _ => None,
    };
    let snapshot = tokio::time::timeout(
        Duration::from_secs(20),
        fetch(&action, &account.email, expected),
    )
    .await
    .map_err(|_| "codexError")??;
    let _guard = vault::lock(&app).await?;
    let mut current = vault::load().await?.ok_or("auth")?;
    if !current.granted()
        || current.client != account.client
        || current.subject != account.subject
        || current.usage_workspace != account.usage_workspace
    {
        return Err("codexMismatch".into());
    }
    if action == Action::Connect {
        current.usage_workspace = snapshot.workspace.clone();
        vault::save(&current).await?;
    }
    Ok(snapshot)
}
