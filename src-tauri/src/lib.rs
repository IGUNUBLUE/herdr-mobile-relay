/// Native shell for the Lerdr web app. The whole product surface —
/// pairing, E2EE, WebRTC, terminal rendering — lives in the bundled web app;
/// Rust only supplies what the Android WebView cannot: local notifications,
/// hardware haptics, camera QR scanning, clipboard, biometric unlock, and (on
/// desktop) deep links.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_haptics::init());

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder
        .plugin(tauri_plugin_barcode_scanner::init())
        .plugin(tauri_plugin_biometric::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            #[cfg(mobile)]
            register_notification_channels(app)?;
            Ok(())
        });

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_deep_link::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running lerdr");
}

/// Notification channels are an Android-side resource the JS bridge cannot
/// create: the plugin only exposes `notify`/`request_permission`/
/// `is_permission_granted` over IPC, so the shell registers its categories
/// once at startup and the web app selects one via `channelId`.
#[cfg(mobile)]
fn register_notification_channels<R: tauri::Runtime>(
    app: &tauri::App<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_notification::{Channel, Importance, NotificationExt};
    let notification = app.notification();
    for channel in [
        Channel::builder("agents-attention", "Agents needing you")
            .description("An agent is blocked on an approval, question, or review")
            .importance(Importance::High)
            .build(),
        Channel::builder("agents-finished", "Agents finished")
            .description("An agent completed its task")
            .importance(Importance::Default)
            .build(),
        Channel::builder("relay-status", "Relay status")
            .description("Connection to a computer was lost or restored")
            .importance(Importance::Low)
            .build(),
    ] {
        notification.create_channel(channel)?;
    }
    Ok(())
}
