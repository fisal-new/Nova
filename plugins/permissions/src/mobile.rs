use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_permissions);

// initializes the Kotlin plugin class
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<Permissions<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("com.nova.permissions", "PermissionsPlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_permissions)?;
    Ok(Permissions(handle))
}

/// Access to the permissions APIs.
pub struct Permissions<R: Runtime>(PluginHandle<R>);

/// Kotlin always answers `{opened: bool}` / `{requested: bool}` — decode the
/// REAL value instead of assuming success (a previous version mapped every
/// successful call to `true`, hiding ROMs that silently drop the intent).
#[derive(serde::Deserialize)]
struct OpenedResponse {
    #[serde(default)]
    opened: bool,
}

#[derive(serde::Deserialize)]
struct RequestedResponse {
    #[serde(default)]
    requested: bool,
}

impl<R: Runtime> Permissions<R> {
    pub fn check_storage(&self) -> crate::Result<StorageState> {
        self.0.run_mobile_plugin("check_storage", ()).map_err(Into::into)
    }

    pub fn request_legacy_storage(&self) -> crate::Result<bool> {
        self.0
            .run_mobile_plugin::<RequestedResponse>("request_legacy_storage", ())
            .map(|r| r.requested)
            .map_err(Into::into)
    }

    pub fn open_all_files_settings(&self) -> crate::Result<bool> {
        self.0
            .run_mobile_plugin::<OpenedResponse>("open_all_files_settings", ())
            .map(|r| r.opened)
            .map_err(Into::into)
    }
}
