const COMMANDS: &[&str] = &[
    "webview_create",
    "webview_navigate",
    "webview_evaluate",
    "webview_action",
    "webview_html_callback",
    "webview_screenshot",
    "webview_screenshot_callback",
    "webview_close",
    "webview_get_html",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .build();
}
