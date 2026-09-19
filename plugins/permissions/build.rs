const COMMANDS: &[&str] = &[
    "check_storage",
    "request_legacy_storage",
    "open_all_files_settings",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
