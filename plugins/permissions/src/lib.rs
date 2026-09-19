use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::Permissions;
#[cfg(mobile)]
use mobile::Permissions;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the permissions APIs.
pub trait PermissionsExt<R: Runtime> {
    fn permissions(&self) -> &Permissions<R>;
}

impl<R: Runtime, T: Manager<R>> crate::PermissionsExt<R> for T {
    fn permissions(&self) -> &Permissions<R> {
        self.state::<Permissions<R>>().inner()
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("permissions")
        .invoke_handler(tauri::generate_handler![
            commands::check_storage,
            commands::request_legacy_storage,
            commands::open_all_files_settings
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let permissions = mobile::init(app, api)?;
            #[cfg(desktop)]
            let permissions = desktop::init(app, api)?;
            app.manage(permissions);
            Ok(())
        })
        .build()
}
