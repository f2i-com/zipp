const COMMANDS: &[&str] = &[
    "list_folder",
    "read_file",
    "write_file",
    "pick_folder",
    "pick_file",
    "native_copy_file",
    "calculate_file_chunks",
    "read_chunk_content",
    "get_downloads_path",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .build();
}
