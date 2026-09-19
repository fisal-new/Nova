use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<Permissions<R>> {
    // Desktop has no runtime storage permissions: report a permissive state
    // so the frontend hides the Android-only grant UI.
    Ok(Permissions(app.clone()))
}

/// Access to the permissions APIs.
pub struct Permissions<R: Runtime>(AppHandle<R>);

impl<R: Runtime> Permissions<R> {
    pub fn check_storage(&self) -> crate::Result<StorageState> {
        Ok(StorageState {
            sdk: 0,
            legacy_granted: true,
            all_files_granted: true,
            external_root: String::new(),
        })
    }

    pub fn request_legacy_storage(&self) -> crate::Result<bool> {
        Ok(true)
    }

    pub fn open_all_files_settings(&self) -> crate::Result<bool> {
        Ok(false)
    }
}
