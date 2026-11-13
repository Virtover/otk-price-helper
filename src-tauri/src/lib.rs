// All pricing logic lives in the TypeScript core; the Rust side only hosts the
// window, the native file dialogs / file access and showing a saved file in its folder.
use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

/// Free space kept around the window on a screen too small for its configured size (logical px).
const SCREEN_MARGIN: f64 = 16.0;

/// The configured size does not fit every screen (a small laptop, or 125–150 % display scaling):
/// shrink the window to the monitor's work area (the screen without the taskbar) and center it there.
fn fit_to_screen(window: &WebviewWindow) -> tauri::Result<()> {
    let Some(monitor) = window.current_monitor()?.or(window.primary_monitor()?) else {
        return Ok(());
    };
    let area = monitor.work_area();
    let outer = window.outer_size()?;
    let inner = window.inner_size()?;
    // Title bar and borders: set_size sets the inner size, the screen has to hold the outer one.
    let frame = PhysicalSize::new(
        outer.width.saturating_sub(inner.width),
        outer.height.saturating_sub(inner.height),
    );
    let margin = (SCREEN_MARGIN * monitor.scale_factor()).round() as u32;
    let width = outer.width.min(area.size.width.saturating_sub(2 * margin));
    let height = outer.height.min(area.size.height.saturating_sub(2 * margin));
    if width != outer.width || height != outer.height {
        window.set_size(PhysicalSize::new(
            width.saturating_sub(frame.width),
            height.saturating_sub(frame.height),
        ))?;
    }
    let x = area.position.x + (area.size.width.saturating_sub(width) / 2) as i32;
    let y = area.position.y + (area.size.height.saturating_sub(height) / 2) as i32;
    window.set_position(PhysicalPosition::new(x, y))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // The window starts hidden (tauri.conf.json) so it never shows off screen first.
            if let Some(window) = app.get_webview_window("main") {
                if let Err(e) = fit_to_screen(&window) {
                    eprintln!("could not fit the window to the screen: {e}");
                }
                window.show()?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running OTK Price Helper");
}
