use tauri::{AppHandle, command, Runtime};

use crate::models::*;
use crate::Result;
use crate::PermissionsExt;

#[command]
pub(crate) async fn check_storage<R: Runtime>(app: AppHandle<R>) -> Result<StorageState> {
    app.permissions().check_storage()
}

#[command]
pub(crate) async fn request_legacy_storage<R: Runtime>(app: AppHandle<R>) -> Result<bool> {
    app.permissions().request_legacy_storage()
}

#[command]
pub(crate) async fn open_all_files_settings<R: Runtime>(app: AppHandle<R>) -> Result<bool> {
    app.permissions().open_all_files_settings()
}
