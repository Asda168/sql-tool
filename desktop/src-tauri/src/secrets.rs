//! Credentials live ONLY in the operating system keychain
//! (Windows Credential Manager / macOS Keychain / Secret Service). They are never written to disk by the app.

const SERVICE: &str = "MySQL Forge Studio";

fn entry(reference: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, reference).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_save(reference: String, secret: String) -> Result<(), String> {
    entry(&reference)?.set_password(&secret).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_get(reference: String) -> Result<Option<String>, String> {
    match entry(&reference)?.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secret_remove(reference: String) -> Result<(), String> {
    match entry(&reference)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
