// All pricing logic lives in the TypeScript core; the Rust side only hosts the
// window and the native file dialogs / file access.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running OTK Price Helper");
}
