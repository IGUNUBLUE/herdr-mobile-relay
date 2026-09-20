fn main() {
    // Android 15+ devices with 16 KB kernels need ELF segments aligned to
    // 16 KB. Tauri overrides .cargo/config.toml rustflags, so the link args
    // go through build.rs where its build pipeline honors them.
    if std::env::var("TARGET")
        .unwrap_or_default()
        .contains("android")
    {
        println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
        println!("cargo:rustc-link-arg=-Wl,-z,common-page-size=16384");
    }
    tauri_build::build()
}
