//! Zipp Database Module - Native SQLite Database
//!
//! This module provides database operations using SQLite.
//! It can be used as a Tauri plugin or standalone library.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, RwLock};
use rusqlite::{Connection, params_from_iter, types::Value as SqlValue};
use tauri::{Manager, State};

// ============================================
// Types
// ============================================

/// Database operation types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Operation {
    Insert,
    Query,
    Update,
    Delete,
}

impl std::str::FromStr for Operation {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "insert" => Ok(Operation::Insert),
            "query" | "select" => Ok(Operation::Query),
            "update" => Ok(Operation::Update),
            "delete" => Ok(Operation::Delete),
            _ => Err(format!("Unknown operation: {}", s)),
        }
    }
}

/// Database operation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseResult {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    #[serde(rename = "insertedId")]
    pub inserted_id: Option<String>,
    #[serde(rename = "rowsAffected")]
    pub rows_affected: Option<usize>,
    pub error: Option<String>,
}

/// Database manager state with connection pooling
/// Uses RwLock for the connections map to allow concurrent read access when looking up
/// connections, and individual Mutex per connection for thread-safe SQLite access
pub struct DatabaseManager {
    data_dir: Mutex<Option<PathBuf>>,
    /// RwLock allows concurrent reads when looking up connections
    /// Each Connection is wrapped in its own Mutex for thread-safe SQLite access
    connections: RwLock<HashMap<String, Mutex<Connection>>>,
}

impl Default for DatabaseManager {
    fn default() -> Self {
        Self {
            data_dir: Mutex::new(None),
            connections: RwLock::new(HashMap::new()),
        }
    }
}

// ============================================
// Database Operations
// ============================================

impl DatabaseManager {
    /// Set the data directory for databases
    pub fn set_data_dir(&self, path: PathBuf) {
        if let Ok(mut data_dir) = self.data_dir.lock() {
            *data_dir = Some(path);
        }
    }

    /// Get the database path for a table
    fn get_db_path(&self, table: &str) -> Result<PathBuf, String> {
        let data_dir = self.data_dir.lock()
            .map_err(|_| "Failed to acquire data_dir lock".to_string())?;
        let base_path = data_dir.as_ref()
            .cloned()
            .unwrap_or_else(|| PathBuf::from("."));
        Ok(base_path.join(format!("{}.db", table)))
    }

    /// Ensure table exists in the given connection
    fn ensure_table(conn: &Connection, table: &str) -> Result<(), String> {
        // Use double quotes around table name to handle reserved keywords like "default"
        conn.execute(
            &format!(
                "CREATE TABLE IF NOT EXISTS \"{}\" (
                    id TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )",
                table
            ),
            [],
        ).map_err(|e| format!("Failed to create table: {}", e))?;
        Ok(())
    }

    /// Execute a database operation
    pub fn execute(
        &self,
        operation: Operation,
        table: &str,
        data: Option<serde_json::Value>,
        query: Option<serde_json::Value>,
    ) -> DatabaseResult {
        match self.execute_internal(operation, table, data, query) {
            Ok(result) => result,
            Err(e) => DatabaseResult {
                success: false,
                data: None,
                inserted_id: None,
                rows_affected: None,
                error: Some(e),
            },
        }
    }

    /// Validate table name (alphanumeric + underscore only)
    fn is_valid_table_name(name: &str) -> bool {
        !name.is_empty() && name.chars().all(|c| c.is_alphanumeric() || c == '_')
    }

    /// Validate JSON key for path extraction (alphanumeric + underscore + dot)
    fn is_valid_json_key(key: &str) -> bool {
        !key.is_empty() && key.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '.')
    }

    /// Convert serde_json::Value to rusqlite::types::Value for proper type handling
    /// This ensures that numbers are compared as numbers (42 = 42) not as strings ('42' != 42)
    fn json_to_sql_value(v: &serde_json::Value) -> SqlValue {
        match v {
            serde_json::Value::Null => SqlValue::Null,
            serde_json::Value::Bool(b) => SqlValue::Integer(if *b { 1 } else { 0 }),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    SqlValue::Integer(i)
                } else if let Some(f) = n.as_f64() {
                    SqlValue::Real(f)
                } else {
                    SqlValue::Text(n.to_string())
                }
            }
            serde_json::Value::String(s) => SqlValue::Text(s.clone()),
            // For arrays and objects, store as JSON string
            serde_json::Value::Array(_) | serde_json::Value::Object(_) => {
                SqlValue::Text(v.to_string())
            }
        }
    }

    fn execute_internal(
        &self,
        operation: Operation,
        table: &str,
        data: Option<serde_json::Value>,
        query: Option<serde_json::Value>,
    ) -> Result<DatabaseResult, String> {
        // Validate table name
        if !Self::is_valid_table_name(table) {
            return Err(format!("Invalid table name: '{}'. Only alphanumeric characters and underscores are allowed.", table));
        }

        // Get path first, releasing the data_dir lock quickly
        let db_path = self.get_db_path(table)?;

        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create database directory: {}", e))?;
        }

        // Check if connection exists using read lock (allows concurrent reads)
        let needs_create = {
            let connections = self.connections.read()
                .map_err(|_| "Failed to acquire connections read lock".to_string())?;
            !connections.contains_key(table)
        };

        // Create connection if needed (only takes write lock when necessary)
        if needs_create {
            let mut connections = self.connections.write()
                .map_err(|_| "Failed to acquire connections write lock".to_string())?;

            // Double-check after acquiring write lock (another thread might have created it)
            if !connections.contains_key(table) {
                // Try to clear stale lock files before opening
                let wal_path = db_path.with_extension("db-wal");
                let shm_path = db_path.with_extension("db-shm");

                // If the main db doesn't exist but lock files do, remove them
                if !db_path.exists() {
                    let _ = std::fs::remove_file(&wal_path);
                    let _ = std::fs::remove_file(&shm_path);
                }

                // Open with specific flags for better concurrency
                let conn = Connection::open_with_flags(
                    &db_path,
                    rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE
                        | rusqlite::OpenFlags::SQLITE_OPEN_CREATE
                        | rusqlite::OpenFlags::SQLITE_OPEN_FULL_MUTEX,
                ).map_err(|e| format!("Failed to open database: {}", e))?;

                // Set busy timeout (10 seconds) - use the rusqlite API
                let _ = conn.busy_timeout(std::time::Duration::from_secs(10));

                // Use WAL mode for better concurrent read/write performance
                // WAL allows readers and writers to operate concurrently
                conn.execute_batch("
                    PRAGMA journal_mode=WAL;
                    PRAGMA synchronous=NORMAL;
                    PRAGMA wal_autocheckpoint=1000;
                ").map_err(|e| format!("Failed to set database PRAGMA: {}", e))?;

                eprintln!("[Database] Opened table '{}' with WAL mode", table);

                Self::ensure_table(&conn, table)?;
                connections.insert(table.to_string(), Mutex::new(conn));
            }
        }

        // Get the connection using read lock and lock the individual connection
        let connections = self.connections.read()
            .map_err(|_| "Failed to acquire connections read lock".to_string())?;
        let conn_mutex = connections.get(table)
            .ok_or_else(|| format!("Failed to get connection for table: {}", table))?;
        let conn = conn_mutex.lock()
            .map_err(|_| "Failed to lock connection".to_string())?;

        match operation {
            Operation::Insert => {
                let data_value = data.ok_or("Insert requires data")?;
                let id = uuid::Uuid::new_v4().to_string();
                let data_str = serde_json::to_string(&data_value)
                    .map_err(|e| format!("Failed to serialize data: {}", e))?;

                conn.execute(
                    &format!("INSERT INTO \"{}\" (id, data) VALUES (?, ?)", table),
                    [&id, &data_str],
                ).map_err(|e| format!("Insert failed: {}", e))?;

                Ok(DatabaseResult {
                    success: true,
                    data: Some(data_value),
                    inserted_id: Some(id),
                    rows_affected: Some(1),
                    error: None,
                })
            }

            Operation::Query => {
                let mut sql = format!("SELECT id, data FROM \"{}\"", table);
                let mut params: Vec<SqlValue> = Vec::new();

                // Build WHERE clause from query
                // Uses proper type handling so numeric comparisons work correctly
                if let Some(query_obj) = query {
                    if let Some(obj) = query_obj.as_object() {
                        if !obj.is_empty() {
                            let mut conditions: Vec<String> = Vec::new();
                            for (k, v) in obj {
                                if !Self::is_valid_json_key(k) {
                                    return Err(format!("Invalid query key: '{}'. Only alphanumeric characters, underscores, and dots are allowed.", k));
                                }
                                // Convert JSON value to SQL value preserving type (numbers stay numbers)
                                params.push(Self::json_to_sql_value(v));
                                conditions.push(format!("json_extract(data, '$.{}') = ?", k));
                            }
                            sql.push_str(&format!(" WHERE {}", conditions.join(" AND ")));
                        }
                    }
                }

                let mut stmt = conn.prepare(&sql)
                    .map_err(|e| format!("Query prepare failed: {}", e))?;

                let rows = stmt.query_map(params_from_iter(params.iter()), |row| {
                    let id: String = row.get(0)?;
                    let data_str: String = row.get(1)?;
                    let data: serde_json::Value = serde_json::from_str(&data_str).unwrap_or(serde_json::Value::Null);
                    let mut obj = serde_json::Map::new();
                    obj.insert("id".to_string(), serde_json::Value::String(id));
                    if let serde_json::Value::Object(data_obj) = data {
                        for (k, v) in data_obj {
                            obj.insert(k, v);
                        }
                    }
                    Ok(serde_json::Value::Object(obj))
                }).map_err(|e| format!("Query failed: {}", e))?;

                let results: Vec<serde_json::Value> = rows.filter_map(|r| r.ok()).collect();

                Ok(DatabaseResult {
                    success: true,
                    data: Some(serde_json::Value::Array(results)),
                    inserted_id: None,
                    rows_affected: None,
                    error: None,
                })
            }

            Operation::Update => {
                let data_value = data.ok_or("Update requires data")?;
                let query_obj = query.ok_or("Update requires query to identify rows")?;

                let id = query_obj.get("id")
                    .and_then(|v| v.as_str())
                    .ok_or("Update query must include 'id'")?;

                let data_str = serde_json::to_string(&data_value)
                    .map_err(|e| format!("Failed to serialize data: {}", e))?;

                let affected = conn.execute(
                    &format!("UPDATE \"{}\" SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", table),
                    [&data_str, id],
                ).map_err(|e| format!("Update failed: {}", e))?;

                Ok(DatabaseResult {
                    success: true,
                    data: Some(data_value),
                    inserted_id: None,
                    rows_affected: Some(affected),
                    error: None,
                })
            }

            Operation::Delete => {
                let query_obj = query.ok_or("Delete requires query to identify rows")?;

                let id = query_obj.get("id")
                    .and_then(|v| v.as_str())
                    .ok_or("Delete query must include 'id'")?;

                let affected = conn.execute(
                    &format!("DELETE FROM \"{}\" WHERE id = ?", table),
                    [id],
                ).map_err(|e| format!("Delete failed: {}", e))?;

                Ok(DatabaseResult {
                    success: true,
                    data: None,
                    inserted_id: None,
                    rows_affected: Some(affected),
                    error: None,
                })
            }
        }
    }
}

// ============================================
// Tauri Plugin Commands
// ============================================

mod commands {
    use super::*;

    #[tauri::command]
    pub async fn database_execute(
        state: State<'_, DatabaseManager>,
        operation: String,
        table: String,
        data: Option<serde_json::Value>,
        query: Option<serde_json::Value>,
    ) -> Result<DatabaseResult, String> {
        let op: Operation = operation.parse()?;
        Ok(state.execute(op, &table, data, query))
    }

    #[tauri::command]
    pub async fn database_set_data_dir(
        state: State<'_, DatabaseManager>,
        path: String,
    ) -> Result<(), String> {
        state.set_data_dir(PathBuf::from(path));
        Ok(())
    }
}

/// Initialize the database module as a Tauri plugin
pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("zipp-database")
        .invoke_handler(tauri::generate_handler![
            commands::database_execute,
            commands::database_set_data_dir,
        ])
        .setup(|app, _| {
            let manager = DatabaseManager::default();

            // Set data directory to app's data dir if available
            if let Ok(app_data) = app.path().app_data_dir() {
                let db_dir = app_data.join("databases");
                let _ = std::fs::create_dir_all(&db_dir);
                manager.set_data_dir(db_dir);
            }

            app.manage(manager);
            Ok(())
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_database_operations() {
        let manager = DatabaseManager::default();
        manager.set_data_dir(std::env::temp_dir().join("zipp_test_db"));

        // Insert
        let insert_result = manager.execute(
            Operation::Insert,
            "test_table",
            Some(serde_json::json!({"name": "Test Item", "value": 42})),
            None,
        );
        assert!(insert_result.success);
        let id = insert_result.inserted_id.unwrap();

        // Query
        let query_result = manager.execute(
            Operation::Query,
            "test_table",
            None,
            Some(serde_json::json!({"name": "Test Item"})),
        );
        assert!(query_result.success);

        // Delete
        let delete_result = manager.execute(
            Operation::Delete,
            "test_table",
            None,
            Some(serde_json::json!({"id": id})),
        );
        assert!(delete_result.success);
    }
}
