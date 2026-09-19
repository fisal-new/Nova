use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageState {
    pub sdk: u32,
    pub legacy_granted: bool,
    pub all_files_granted: bool,
    pub external_root: String,
}
