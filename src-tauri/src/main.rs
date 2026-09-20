// The Android shell enters through the library's mobile_entry_point; this
// binary keeps `cargo tauri dev` usable on the desktop for quick UI checks.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    herdr_mobile_lib::run()
}
