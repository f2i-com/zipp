fn main() {
    tauri_plugin::Builder::new(&["terminal_create", "terminal_screenshot", "terminal_send_keys", "terminal_read_output", "terminal_close", "terminal_show_window", "terminal_list_sessions"])
        .build();
}
