/// Native shell for the Herdr Mobile web app. The whole product surface —
/// pairing, E2EE, WebRTC, terminal rendering — lives in the bundled web app;
/// Rust only supplies what the Android WebView cannot: local notifications,
/// hardware haptics, and (on desktop) deep links.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_haptics::init());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_deep_link::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running herdr-mobile");
}
