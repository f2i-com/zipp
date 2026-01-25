//! API Server Module
//!
//! Provides an HTTP API for external applications to interact with Zipp's job queue.
//! Uses axum for the HTTP server and Tauri events to bridge with the frontend.

use axum::{
    extract::{DefaultBodyLimit, Path, Query, Request, State},
    http::{header, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post, put},
    Json, Router,
};
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Emitter, Listener, Manager};
use tokio::sync::{broadcast, oneshot};
use tower_http::{
    cors::{Any, CorsLayer},
    services::ServeDir,
};
use uuid::Uuid;

use crate::packages;
use crate::services;

// ============================================================================
// Types
// ============================================================================

/// API Server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiServerConfig {
    pub enabled: bool,
    pub port: u16,
    pub host: String,
    /// API key for authentication (empty = no auth required)
    #[serde(default)]
    pub api_key: String,
}

impl Default for ApiServerConfig {
    fn default() -> Self {
        Self {
            enabled: true,  // Enabled by default for MCP server integration
            port: 3000,
            host: "127.0.0.1".to_string(),  // Localhost only - not accessible from network
            api_key: String::new(),
        }
    }
}

/// Request payload to create a new job
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateJobRequest {
    pub flow_id: String,
    #[serde(default)]
    pub inputs: Option<serde_json::Value>,
    #[serde(default = "default_priority")]
    pub priority: i32,
    /// If true, AI nodes will yield to Claude for completion
    #[serde(default)]
    pub use_claude_for_ai: bool,
}

/// Request payload to continue a job that yielded for AI input
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinueJobRequest {
    pub continue_token: String,
    pub response: String,
}

fn default_priority() -> i32 {
    1
}

/// Query parameters for listing jobs
#[derive(Debug, Deserialize)]
pub struct ListJobsQuery {
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub limit: Option<usize>,
}

/// Request payload to create a new flow
#[derive(Debug, Deserialize)]
pub struct CreateFlowRequest {
    pub name: String,
    #[serde(default)]
    pub graph: Option<serde_json::Value>,
}

/// Request payload to update a flow
#[derive(Debug, Deserialize)]
pub struct UpdateFlowRequest {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub graph: Option<serde_json::Value>,
}

/// Request payload to update flow graph
#[derive(Debug, Deserialize)]
pub struct UpdateGraphRequest {
    pub graph: serde_json::Value,
}

/// Query parameters for listing nodes
#[derive(Debug, Deserialize)]
pub struct ListNodesQuery {
    #[serde(default)]
    pub category: Option<String>,
}

/// Request payload to start a service
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartServiceRequest {
    #[serde(default)]
    pub env_vars: Option<std::collections::HashMap<String, String>>,
}

/// Query parameters for service output
#[derive(Debug, Deserialize)]
pub struct ServiceOutputQuery {
    #[serde(default)]
    pub limit: Option<usize>,
}

/// API response wrapper
#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(message: impl Into<String>) -> ApiResponse<()> {
        ApiResponse {
            success: false,
            data: None,
            error: Some(message.into()),
        }
    }
}

/// Job status response from frontend
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JobStatusResponse {
    pub id: String,
    pub flow_id: String,
    pub flow_name: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub submitted_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Flow info for listing available flows
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FlowInfo {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// Job creation response
#[derive(Debug, Serialize)]
pub struct CreateJobResponse {
    pub job_id: String,
    pub status: String,
    pub position: usize,
}

// ============================================================================
// State Management
// ============================================================================

/// Shared application state for the API server
struct ApiState {
    app_handle: AppHandle,
    pending_requests: Arc<Mutex<HashMap<String, oneshot::Sender<serde_json::Value>>>>,
    api_key: String,
}

/// Global state for server control
static SERVER_SHUTDOWN: OnceCell<Mutex<Option<broadcast::Sender<()>>>> = OnceCell::new();
static CURRENT_CONFIG: OnceCell<Mutex<ApiServerConfig>> = OnceCell::new();

// ============================================================================
// Tauri Commands
// ============================================================================

/// Get current API server configuration
#[tauri::command]
pub fn get_api_config() -> ApiServerConfig {
    CURRENT_CONFIG
        .get()
        .and_then(|m| m.lock().ok())
        .map(|c| c.clone())
        .unwrap_or_default()
}

/// Update API server configuration and restart if needed
#[tauri::command]
pub async fn set_api_config(app: AppHandle, config: ApiServerConfig) -> Result<ApiServerConfig, String> {
    // Determine what action to take while holding the lock briefly
    let action = {
        if let Some(mutex) = CURRENT_CONFIG.get() {
            if let Ok(mut current) = mutex.lock() {
                let was_enabled = current.enabled;
                let old_port = current.port;
                let old_host = current.host.clone();

                *current = config.clone();

                // Determine action based on config changes
                if was_enabled && !config.enabled {
                    Some("stop")
                } else if config.enabled && (!was_enabled || old_port != config.port || old_host != config.host) {
                    Some("restart")
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            let _ = CURRENT_CONFIG.set(Mutex::new(config.clone()));
            if config.enabled {
                Some("start")
            } else {
                None
            }
        }
    };

    // Perform the action without holding the lock
    match action {
        Some("stop") => {
            stop_server();
        }
        Some("restart") => {
            stop_server();
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            start_server(app, config.clone());
        }
        Some("start") => {
            start_server(app, config.clone());
        }
        _ => {}
    }

    Ok(config)
}

/// Get API server status
#[tauri::command]
pub fn get_api_status() -> serde_json::Value {
    let config = get_api_config();
    let is_running = SERVER_SHUTDOWN
        .get()
        .and_then(|m| m.lock().ok())
        .map(|opt| opt.is_some())
        .unwrap_or(false);

    // Use localhost for display when bound to all interfaces
    let display_host = if config.host == "0.0.0.0" { "localhost" } else { &config.host };

    serde_json::json!({
        "enabled": config.enabled,
        "running": is_running && config.enabled,
        "port": config.port,
        "host": config.host,
        "url": format!("http://{}:{}", display_host, config.port),
        "auth_required": !config.api_key.is_empty()
    })
}

// ============================================================================
// Server Control
// ============================================================================

/// Initialize the API server module
pub fn init(app: AppHandle) {
    let config = ApiServerConfig::default();
    let should_start = config.enabled;

    let _ = CURRENT_CONFIG.set(Mutex::new(config.clone()));
    let _ = SERVER_SHUTDOWN.set(Mutex::new(None));

    // Set up event listener for frontend responses
    let pending_requests: Arc<Mutex<HashMap<String, oneshot::Sender<serde_json::Value>>>> =
        Arc::new(Mutex::new(HashMap::new()));

    let pending_clone = pending_requests.clone();
    app.listen("api:response", move |event| {
        if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
            if let (Some(req_id), Some(data)) = (
                payload.get("requestId").and_then(|v| v.as_str()),
                payload.get("data"),
            ) {
                if let Ok(mut map) = pending_clone.lock() {
                    if let Some(tx) = map.remove(req_id) {
                        let _ = tx.send(data.clone());
                    }
                }
            }
        }
    });

    // Store pending requests in app state for later use
    app.manage(pending_requests);

    // Auto-start server if enabled by default
    if should_start {
        start_server(app, config);
        println!("[API Server] Auto-started on http://127.0.0.1:3000");
    } else {
        println!("[API Server] Module initialized (server disabled)");
    }
}

/// Start the API server with given configuration
fn start_server(app: AppHandle, config: ApiServerConfig) {
    let pending_requests = app
        .try_state::<Arc<Mutex<HashMap<String, oneshot::Sender<serde_json::Value>>>>>()
        .map(|s| (*s).clone())
        .unwrap_or_else(|| Arc::new(Mutex::new(HashMap::new())));

    // Get output directory (downloads folder)
    let output_dir = dirs::download_dir().unwrap_or_else(|| PathBuf::from("."));

    let state = Arc::new(ApiState {
        app_handle: app.clone(),
        pending_requests,
        api_key: config.api_key.clone(),
    });

    let (shutdown_tx, mut shutdown_rx) = broadcast::channel::<()>(1);

    // Store the shutdown sender for later use
    if let Some(mutex) = SERVER_SHUTDOWN.get() {
        if let Ok(mut opt) = mutex.lock() {
            *opt = Some(shutdown_tx);
        }
    }

    let host = config.host.clone();
    let port = config.port;

    tauri::async_runtime::spawn(async move {
        // CORS configuration
        let cors = CorsLayer::new()
            .allow_methods([Method::GET, Method::POST, Method::PUT, Method::PATCH, Method::DELETE, Method::OPTIONS])
            .allow_headers(Any)
            .allow_origin(Any);

        // Build router with API key authentication middleware
        let state_clone = state.clone();
        let app_router = Router::new()
            // Job management routes
            .route("/api/jobs", post(create_job))
            .route("/api/jobs", get(list_jobs))
            .route("/api/jobs/continue", post(continue_job))
            .route("/api/jobs/:id", get(get_job_status))
            .route("/api/jobs/:id", delete(abort_job))
            .route("/api/jobs/:id/logs", get(get_job_logs))
            // Flow management
            .route("/api/flows", get(list_flows))
            .route("/api/flows", post(create_flow))
            .route("/api/flows/:id", get(get_flow))
            .route("/api/flows/:id", patch(update_flow))
            .route("/api/flows/:id", delete(delete_flow))
            .route("/api/flows/:id/graph", put(update_flow_graph))
            .route("/api/flows/:id/validate", post(validate_flow))
            // Node/Module introspection
            .route("/api/nodes", get(list_nodes))
            .route("/api/nodes/:type", get(get_node_definition))
            .route("/api/modules", get(list_modules))
            // Service management
            .route("/api/services", get(list_services_handler))
            .route("/api/services/:id", get(get_service_status_handler))
            .route("/api/services/:id/start", post(start_service_handler))
            .route("/api/services/:id/stop", post(stop_service_handler))
            .route("/api/services/:id/output", get(get_service_output_handler))
            .route("/api/services/:id/output", delete(clear_service_output_handler))
            .route("/api/services/:id/port", get(get_service_port_handler))
            .route("/api/services/:id/ensure", post(ensure_service_handler))
            // Health check
            .route("/api/health", get(health_check))
            // Package management
            .route("/api/packages", get(list_packages_handler))
            .route("/api/packages/load", post(load_package_handler))
            .route("/api/packages/:id", get(get_package_handler))
            .route("/api/packages/:id/close", post(close_package_handler))
            .route("/api/packages/:id/run", post(run_package_workflow_handler))
            // System control endpoints
            .route("/api/system/clear-cache", post(clear_cache_handler))
            .route("/api/system/reload-macros", post(reload_macros_handler))
            .route("/api/system/restart", post(restart_handler))
            .route("/api/system/recompile-packages", post(recompile_packages_handler))
            // File serving
            .nest_service("/api/files", ServeDir::new(output_dir))
            // Apply authentication middleware
            .layer(middleware::from_fn_with_state(state_clone, api_key_auth))
            .layer(cors)
            // Limit request body size to 10MB to prevent DoS attacks
            .layer(DefaultBodyLimit::max(10 * 1024 * 1024))
            .with_state(state);

        let addr: SocketAddr = format!("{}:{}", host, port)
            .parse()
            .unwrap_or_else(|_| SocketAddr::from(([127, 0, 0, 1], 3000)));

        println!("[API Server] Starting on http://{}", addr);

        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[API Server] Failed to bind to {}: {}", addr, e);
                // Clear the shutdown sender since server failed to start
                clear_shutdown_sender();
                return;
            }
        };

        let server = axum::serve(listener, app_router);

        tokio::select! {
            result = server => {
                if let Err(e) = result {
                    eprintln!("[API Server] Server error: {}", e);
                }
            }
            _ = shutdown_rx.recv() => {
                println!("[API Server] Shutting down...");
            }
        }

        // Clear the shutdown sender when server exits
        clear_shutdown_sender();
    });
}

/// Stop the API server
fn stop_server() {
    if let Some(mutex) = SERVER_SHUTDOWN.get() {
        if let Ok(mut opt) = mutex.lock() {
            if let Some(tx) = opt.take() {
                let _ = tx.send(());
            }
        }
    }
}

/// Clear the shutdown sender (called when server exits)
fn clear_shutdown_sender() {
    if let Some(mutex) = SERVER_SHUTDOWN.get() {
        if let Ok(mut opt) = mutex.lock() {
            *opt = None;
        }
    }
}

// ============================================================================
// Middleware
// ============================================================================

/// API key authentication middleware
async fn api_key_auth(
    State(state): State<Arc<ApiState>>,
    request: Request,
    next: Next,
) -> Response {
    // If no API key is configured, allow all requests
    if state.api_key.is_empty() {
        return next.run(request).await;
    }

    // Allow OPTIONS preflight requests (CORS)
    if request.method() == Method::OPTIONS {
        return next.run(request).await;
    }

    // Allow health check without authentication
    if request.uri().path() == "/api/health" {
        return next.run(request).await;
    }

    // Check for API key in header
    let auth_header = request
        .headers()
        .get("x-api-key")
        .and_then(|v| v.to_str().ok());

    // Also check Authorization: Bearer <key> header
    let bearer_token = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "));

    let provided_key = auth_header.or(bearer_token);

    match provided_key {
        Some(key) if key == state.api_key => next.run(request).await,
        _ => (
            StatusCode::UNAUTHORIZED,
            Json(ApiResponse::<()>::error("Invalid or missing API key. Provide via 'x-api-key' header or 'Authorization: Bearer <key>'")),
        )
            .into_response(),
    }
}

// ============================================================================
// Route Handlers
// ============================================================================

/// Health check endpoint
async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "service": "zipp-api",
        "version": "1.0.0"
    }))
}

/// Create a new job
async fn create_job(
    State(state): State<Arc<ApiState>>,
    Json(payload): Json<CreateJobRequest>,
) -> impl IntoResponse {
    let response = call_frontend(
        &state,
        "create_job",
        serde_json::json!({
            "flowId": payload.flow_id,
            "inputs": payload.inputs,
            "priority": payload.priority,
            "useClaudeForAI": payload.use_claude_for_ai
        }),
    )
    .await;

    match response {
        Ok(data) => {
            if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                // Determine appropriate status code based on error type
                let status = if error.contains("not found") {
                    StatusCode::NOT_FOUND
                } else if error.contains("not initialized") {
                    StatusCode::SERVICE_UNAVAILABLE
                } else {
                    StatusCode::BAD_REQUEST
                };
                (status, Json(ApiResponse::<()>::error(error))).into_response()
            } else {
                (StatusCode::CREATED, Json(ApiResponse::success(data))).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// Continue a job that yielded for AI input
async fn continue_job(
    State(state): State<Arc<ApiState>>,
    Json(payload): Json<ContinueJobRequest>,
) -> impl IntoResponse {
    let response = call_frontend(
        &state,
        "continue_job",
        serde_json::json!({
            "continueToken": payload.continue_token,
            "response": payload.response
        }),
    )
    .await;

    match response {
        Ok(data) => {
            if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                let status = if error.contains("not found") {
                    StatusCode::NOT_FOUND
                } else if error.contains("invalid") {
                    StatusCode::BAD_REQUEST
                } else {
                    StatusCode::INTERNAL_SERVER_ERROR
                };
                (status, Json(ApiResponse::<()>::error(error))).into_response()
            } else {
                (StatusCode::OK, Json(ApiResponse::success(data))).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// Get job status by ID
async fn get_job_status(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let response = call_frontend(&state, "get_job", serde_json::json!({ "jobId": id })).await;

    match response {
        Ok(data) => {
            if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                let status = if error.contains("not initialized") {
                    StatusCode::SERVICE_UNAVAILABLE
                } else {
                    StatusCode::NOT_FOUND
                };
                (status, Json(ApiResponse::<()>::error(error))).into_response()
            } else {
                (StatusCode::OK, Json(ApiResponse::success(data))).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// Get job logs
async fn get_job_logs(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let response = call_frontend(&state, "get_job_logs", serde_json::json!({ "jobId": id })).await;

    match response {
        Ok(data) => {
            if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                let status = if error.contains("not initialized") {
                    StatusCode::SERVICE_UNAVAILABLE
                } else {
                    StatusCode::NOT_FOUND
                };
                (status, Json(ApiResponse::<()>::error(error))).into_response()
            } else {
                (StatusCode::OK, Json(ApiResponse::success(data))).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// List all jobs
async fn list_jobs(
    State(state): State<Arc<ApiState>>,
    Query(params): Query<ListJobsQuery>,
) -> impl IntoResponse {
    let response = call_frontend(
        &state,
        "list_jobs",
        serde_json::json!({
            "status": params.status,
            "limit": params.limit
        }),
    )
    .await;

    match response {
        Ok(data) => {
            if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                let status = if error.contains("not initialized") {
                    StatusCode::SERVICE_UNAVAILABLE
                } else {
                    StatusCode::INTERNAL_SERVER_ERROR
                };
                (status, Json(ApiResponse::<()>::error(error))).into_response()
            } else {
                (StatusCode::OK, Json(ApiResponse::success(data))).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// Abort a job
async fn abort_job(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let response = call_frontend(&state, "abort_job", serde_json::json!({ "jobId": id })).await;

    match response {
        Ok(data) => {
            if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                // Determine appropriate status code based on error type
                let status = if error.contains("not initialized") {
                    StatusCode::SERVICE_UNAVAILABLE
                } else if error.contains("not found") {
                    StatusCode::NOT_FOUND
                } else {
                    StatusCode::BAD_REQUEST
                };
                (status, Json(ApiResponse::<()>::error(error))).into_response()
            } else {
                (StatusCode::OK, Json(ApiResponse::success(data))).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// List available flows
async fn list_flows(State(state): State<Arc<ApiState>>) -> impl IntoResponse {
    let response = call_frontend(&state, "list_flows", serde_json::json!({})).await;

    match response {
        Ok(data) => (StatusCode::OK, Json(ApiResponse::success(data))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// Create a new flow
async fn create_flow(
    State(state): State<Arc<ApiState>>,
    Json(payload): Json<CreateFlowRequest>,
) -> impl IntoResponse {
    let response = call_frontend(
        &state,
        "create_flow",
        serde_json::json!({
            "name": payload.name,
            "graph": payload.graph
        }),
    )
    .await;

    match response {
        Ok(data) => {
            if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                let status = if error.contains("not available") {
                    StatusCode::SERVICE_UNAVAILABLE
                } else if error.contains("required") {
                    StatusCode::BAD_REQUEST
                } else {
                    StatusCode::INTERNAL_SERVER_ERROR
                };
                (status, Json(ApiResponse::<()>::error(error))).into_response()
            } else {
                (StatusCode::CREATED, Json(ApiResponse::success(data))).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// Delete a flow
async fn delete_flow(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let response = call_frontend(&state, "delete_flow", serde_json::json!({ "flowId": id })).await;

    match response {
        Ok(data) => {
            if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                let status = if error.contains("not available") {
                    StatusCode::SERVICE_UNAVAILABLE
                } else if error.contains("not found") {
                    StatusCode::NOT_FOUND
                } else if error.contains("required") {
                    StatusCode::BAD_REQUEST
                } else {
                    StatusCode::INTERNAL_SERVER_ERROR
                };
                (status, Json(ApiResponse::<()>::error(error))).into_response()
            } else {
                (StatusCode::OK, Json(ApiResponse::success(data))).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// Get a single flow by ID
async fn get_flow(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let response = call_frontend(&state, "get_flow", serde_json::json!({ "flowId": id })).await;

    match response {
        Ok(data) => {
            if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                let status = if error.contains("not available") {
                    StatusCode::SERVICE_UNAVAILABLE
                } else if error.contains("not found") {
                    StatusCode::NOT_FOUND
                } else {
                    StatusCode::INTERNAL_SERVER_ERROR
                };
                (status, Json(ApiResponse::<()>::error(error))).into_response()
            } else {
                (StatusCode::OK, Json(ApiResponse::success(data))).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// Update a flow (name, description, graph)
async fn update_flow(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateFlowRequest>,
) -> impl IntoResponse {
    let response = call_frontend(
        &state,
        "update_flow",
        serde_json::json!({
            "flowId": id,
            "name": payload.name,
            "description": payload.description,
            "graph": payload.graph
        }),
    )
    .await;

    match response {
        Ok(data) => {
            if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                let status = if error.contains("not available") {
                    StatusCode::SERVICE_UNAVAILABLE
                } else if error.contains("not found") {
                    StatusCode::NOT_FOUND
                } else {
                    StatusCode::BAD_REQUEST
                };
                (status, Json(ApiResponse::<()>::error(error))).into_response()
            } else {
                (StatusCode::OK, Json(ApiResponse::success(data))).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// Update flow graph (replace entire graph)
async fn update_flow_graph(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateGraphRequest>,
) -> impl IntoResponse {
    let response = call_frontend(
        &state,
        "update_flow_graph",
        serde_json::json!({
            "flowId": id,
            "graph": payload.graph
        }),
    )
    .await;

    match response {
        Ok(data) => {
            if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                let status = if error.contains("not available") {
                    StatusCode::SERVICE_UNAVAILABLE
                } else if error.contains("not found") {
                    StatusCode::NOT_FOUND
                } else {
                    StatusCode::BAD_REQUEST
                };
                (status, Json(ApiResponse::<()>::error(error))).into_response()
            } else {
                (StatusCode::OK, Json(ApiResponse::success(data))).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// Validate a flow
async fn validate_flow(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let response = call_frontend(&state, "validate_flow", serde_json::json!({ "flowId": id })).await;

    match response {
        Ok(data) => {
            if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                let status = if error.contains("not available") {
                    StatusCode::SERVICE_UNAVAILABLE
                } else if error.contains("not found") {
                    StatusCode::NOT_FOUND
                } else {
                    StatusCode::INTERNAL_SERVER_ERROR
                };
                (status, Json(ApiResponse::<()>::error(error))).into_response()
            } else {
                (StatusCode::OK, Json(ApiResponse::success(data))).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// List available node types
async fn list_nodes(
    State(state): State<Arc<ApiState>>,
    Query(params): Query<ListNodesQuery>,
) -> impl IntoResponse {
    let response = call_frontend(
        &state,
        "list_nodes",
        serde_json::json!({
            "category": params.category
        }),
    )
    .await;

    match response {
        Ok(data) => {
            if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                let status = if error.contains("not available") {
                    StatusCode::SERVICE_UNAVAILABLE
                } else {
                    StatusCode::INTERNAL_SERVER_ERROR
                };
                (status, Json(ApiResponse::<()>::error(error))).into_response()
            } else {
                (StatusCode::OK, Json(ApiResponse::success(data))).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// Get node type definition
async fn get_node_definition(
    State(state): State<Arc<ApiState>>,
    Path(node_type): Path<String>,
) -> impl IntoResponse {
    let response = call_frontend(&state, "get_node_definition", serde_json::json!({ "nodeType": node_type })).await;

    match response {
        Ok(data) => {
            if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                let status = if error.contains("not available") {
                    StatusCode::SERVICE_UNAVAILABLE
                } else if error.contains("not found") {
                    StatusCode::NOT_FOUND
                } else {
                    StatusCode::INTERNAL_SERVER_ERROR
                };
                (status, Json(ApiResponse::<()>::error(error))).into_response()
            } else {
                (StatusCode::OK, Json(ApiResponse::success(data))).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// List loaded modules
async fn list_modules(State(state): State<Arc<ApiState>>) -> impl IntoResponse {
    let response = call_frontend(&state, "list_modules", serde_json::json!({})).await;

    match response {
        Ok(data) => {
            if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                let status = if error.contains("not available") {
                    StatusCode::SERVICE_UNAVAILABLE
                } else {
                    StatusCode::INTERNAL_SERVER_ERROR
                };
                (status, Json(ApiResponse::<()>::error(error))).into_response()
            } else {
                (StatusCode::OK, Json(ApiResponse::success(data))).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

// ============================================================================
// Service Handlers
// ============================================================================

/// List all available services
async fn list_services_handler() -> impl IntoResponse {
    match services::list_services() {
        Ok(services_list) => (StatusCode::OK, Json(ApiResponse::success(services_list))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// Get status of a specific service
async fn get_service_status_handler(
    State(_state): State<Arc<ApiState>>,
    Path(service_id): Path<String>,
) -> impl IntoResponse {
    // First check if the service exists
    match services::list_services() {
        Ok(services_list) => {
            let service = services_list.iter().find(|s| s.id == service_id);
            match service {
                Some(info) => {
                    // Check health status
                    match services::check_service_health(service_id.clone(), info.port).await {
                        Ok(status) => (StatusCode::OK, Json(ApiResponse::success(status))).into_response(),
                        Err(e) => (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(ApiResponse::<()>::error(e)),
                        )
                            .into_response(),
                    }
                }
                None => (
                    StatusCode::NOT_FOUND,
                    Json(ApiResponse::<()>::error(format!("Service '{}' not found", service_id))),
                )
                    .into_response(),
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// Start a service
async fn start_service_handler(
    State(state): State<Arc<ApiState>>,
    Path(service_id): Path<String>,
    Json(payload): Json<Option<StartServiceRequest>>,
) -> impl IntoResponse {
    let env_vars = payload.and_then(|p| p.env_vars);

    match services::start_service(state.app_handle.clone(), service_id.clone(), env_vars).await {
        Ok(status) => (StatusCode::OK, Json(ApiResponse::success(status))).into_response(),
        Err(e) => {
            let status_code = if e.contains("not found") {
                StatusCode::NOT_FOUND
            } else if e.contains("already running") {
                StatusCode::CONFLICT
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            (status_code, Json(ApiResponse::<()>::error(e))).into_response()
        }
    }
}

/// Stop a service
async fn stop_service_handler(
    State(state): State<Arc<ApiState>>,
    Path(service_id): Path<String>,
) -> impl IntoResponse {
    match services::stop_service(state.app_handle.clone(), service_id.clone()).await {
        Ok(status) => (StatusCode::OK, Json(ApiResponse::success(status))).into_response(),
        Err(e) => {
            let status_code = if e.contains("not found") {
                StatusCode::NOT_FOUND
            } else if e.contains("not running") {
                StatusCode::CONFLICT
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            (status_code, Json(ApiResponse::<()>::error(e))).into_response()
        }
    }
}

/// Get service output logs
async fn get_service_output_handler(
    State(state): State<Arc<ApiState>>,
    Path(service_id): Path<String>,
    Query(params): Query<ServiceOutputQuery>,
) -> impl IntoResponse {
    match services::get_service_output(state.app_handle.clone(), service_id.clone(), params.limit) {
        Ok(output) => (StatusCode::OK, Json(ApiResponse::success(output))).into_response(),
        Err(e) => {
            let status_code = if e.contains("not found") {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            (status_code, Json(ApiResponse::<()>::error(e))).into_response()
        }
    }
}

/// Clear service output logs
async fn clear_service_output_handler(
    State(state): State<Arc<ApiState>>,
    Path(service_id): Path<String>,
) -> impl IntoResponse {
    match services::clear_service_output(state.app_handle.clone(), service_id.clone()) {
        Ok(_) => (StatusCode::OK, Json(ApiResponse::success(serde_json::json!({ "cleared": true })))).into_response(),
        Err(e) => {
            let status_code = if e.contains("not found") {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            (status_code, Json(ApiResponse::<()>::error(e))).into_response()
        }
    }
}

/// Get the port a running service is using
async fn get_service_port_handler(
    State(state): State<Arc<ApiState>>,
    Path(service_id): Path<String>,
) -> impl IntoResponse {
    let port = services::get_service_port(state.app_handle.clone(), service_id);
    (StatusCode::OK, Json(ApiResponse::success(serde_json::json!({ "port": port })))).into_response()
}

/// Ensure a service is running and healthy (auto-start if needed)
async fn ensure_service_handler(
    State(state): State<Arc<ApiState>>,
    Path(service_id): Path<String>,
) -> impl IntoResponse {
    match services::ensure_service_ready(state.app_handle.clone(), service_id.clone()).await {
        Ok(result) => (StatusCode::OK, Json(ApiResponse::success(result))).into_response(),
        Err(e) => {
            let status_code = if e.contains("not found") {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            (status_code, Json(ApiResponse::<()>::error(e))).into_response()
        }
    }
}

// ============================================================================
// System Control Handlers
// ============================================================================

/// Clear application cache
async fn clear_cache_handler(
    State(state): State<Arc<ApiState>>,
) -> impl IntoResponse {
    let response = call_frontend(&state, "clear_cache", serde_json::json!({})).await;

    match response {
        Ok(data) => {
            if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::error(error))).into_response()
            } else {
                (StatusCode::OK, Json(ApiResponse::success(data))).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// Reload macros from disk
async fn reload_macros_handler(
    State(state): State<Arc<ApiState>>,
) -> impl IntoResponse {
    let response = call_frontend(&state, "reload_macros", serde_json::json!({})).await;

    match response {
        Ok(data) => {
            if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::error(error))).into_response()
            } else {
                (StatusCode::OK, Json(ApiResponse::success(data))).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// Restart the application (skip splash screen)
async fn restart_handler(
    State(state): State<Arc<ApiState>>,
) -> impl IntoResponse {
    let response = call_frontend(&state, "restart_app", serde_json::json!({})).await;

    match response {
        Ok(data) => {
            if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::error(error))).into_response()
            } else {
                (StatusCode::OK, Json(ApiResponse::success(data))).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

/// Recompile packages (rebuild zipp-core, etc.)
async fn recompile_packages_handler(
    State(state): State<Arc<ApiState>>,
) -> impl IntoResponse {
    let response = call_frontend(&state, "recompile_packages", serde_json::json!({})).await;

    match response {
        Ok(data) => {
            if let Some(error) = data.get("error").and_then(|e| e.as_str()) {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::error(error))).into_response()
            } else {
                (StatusCode::OK, Json(ApiResponse::success(data))).into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(e)),
        )
            .into_response(),
    }
}

// ============================================================================
// Frontend Bridge
// ============================================================================

/// Call the frontend via Tauri events and wait for response
async fn call_frontend(
    state: &Arc<ApiState>,
    command: &str,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let request_id = Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel();

    // Store the response channel
    {
        let mut map = state.pending_requests.lock().map_err(|e| e.to_string())?;
        map.insert(request_id.clone(), tx);
    }

    // Emit event to frontend
    let event_payload = serde_json::json!({
        "requestId": request_id,
        "command": command,
        "payload": payload
    });

    if let Err(e) = state.app_handle.emit("api:request", event_payload) {
        // Cleanup on error
        if let Ok(mut map) = state.pending_requests.lock() {
            map.remove(&request_id);
        }
        return Err(format!("Failed to emit event: {}", e));
    }

    // Wait for response with timeout
    match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
        Ok(Ok(result)) => Ok(result),
        Ok(Err(_)) => {
            // Cleanup on channel closed
            if let Ok(mut map) = state.pending_requests.lock() {
                map.remove(&request_id);
            }
            Err("Response channel closed".to_string())
        }
        Err(_) => {
            // Cleanup on timeout
            if let Ok(mut map) = state.pending_requests.lock() {
                map.remove(&request_id);
            }
            Err("Request timeout".to_string())
        }
    }
}

// ============================================================================
// Package Management Handlers
// ============================================================================

/// Request to load and run a .zipp package
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadPackageRequest {
    /// Path to the .zipp package file
    pub package_path: String,
    /// Whether to trust the package (grant requested permissions)
    #[serde(default)]
    pub trust: bool,
    /// Whether to auto-start services defined in the package
    #[serde(default = "default_true")]
    pub auto_start_services: bool,
}

fn default_true() -> bool {
    true
}

/// Request to run a workflow in a loaded package
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunPackageWorkflowRequest {
    /// Optional inputs to pass to the workflow
    #[serde(default)]
    pub inputs: Option<serde_json::Value>,
    /// Flow path within the package (defaults to entryFlow)
    pub flow_path: Option<String>,
}

// =============================================================================
// Standalone/Headless Mode
// =============================================================================

/// Run the API server in standalone mode (headless, no Tauri frontend)
/// This provides limited functionality - services management and health checks
/// but cannot run workflows that require the frontend.
pub async fn run_standalone(config: ApiServerConfig) {
    println!("[API Server] Starting in standalone/headless mode...");
    println!("[API Server] URL: http://{}:{}", config.host, config.port);
    if !config.api_key.is_empty() {
        println!("[API Server] Authentication: ENABLED");
    } else {
        println!("[API Server] Authentication: DISABLED (no API key set)");
    }
    println!();

    // CORS configuration
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::PATCH, Method::DELETE, Method::OPTIONS])
        .allow_headers(Any)
        .allow_origin(Any);

    // Build a minimal router for headless mode
    // Note: Most endpoints require frontend, so we only expose limited functionality
    let api_key_for_auth = config.api_key.clone();
    let app_router = Router::new()
        // Health check
        .route("/api/health", get(health_check))
        // Headless-specific info endpoint
        .route("/api/info", get(|| async {
            Json(serde_json::json!({
                "mode": "headless",
                "version": "1.0.0",
                "service": "zipp-api",
                "message": "Running in headless mode. Limited functionality available."
            }))
        }))
        // Services management (works without frontend)
        .route("/api/services", get(list_services_handler))
        // Apply authentication middleware for all routes except health
        .layer(middleware::from_fn(move |request: Request, next: Next| {
            let api_key = api_key_for_auth.clone();
            async move {
                // Allow health check without auth
                if request.uri().path() == "/api/health" || request.uri().path() == "/api/info" {
                    return next.run(request).await;
                }

                // Allow OPTIONS preflight
                if request.method() == Method::OPTIONS {
                    return next.run(request).await;
                }

                // Check API key if configured
                if !api_key.is_empty() {
                    let auth_header = request
                        .headers()
                        .get("x-api-key")
                        .and_then(|v| v.to_str().ok());

                    let bearer_token = request
                        .headers()
                        .get(header::AUTHORIZATION)
                        .and_then(|v| v.to_str().ok())
                        .and_then(|s| s.strip_prefix("Bearer "));

                    let provided_key = auth_header.or(bearer_token);

                    match provided_key {
                        Some(key) if key == api_key => {}
                        _ => {
                            return (
                                StatusCode::UNAUTHORIZED,
                                Json(ApiResponse::<()>::error("Invalid or missing API key")),
                            ).into_response();
                        }
                    }
                }

                next.run(request).await
            }
        }))
        .layer(cors)
        .layer(DefaultBodyLimit::max(10 * 1024 * 1024));

    let addr: SocketAddr = format!("{}:{}", config.host, config.port)
        .parse()
        .unwrap_or_else(|_| SocketAddr::from(([127, 0, 0, 1], 3000)));

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[API Server] Failed to bind to {}: {}", addr, e);
            return;
        }
    };

    println!("[API Server] Listening on http://{}", addr);
    println!("[API Server] Press Ctrl+C to stop");
    println!();

    // Run the server
    if let Err(e) = axum::serve(listener, app_router).await {
        eprintln!("[API Server] Server error: {}", e);
    }
}

/// List all installed packages
async fn list_packages_handler() -> impl IntoResponse {
    match packages::list_packages() {
        Ok(packages) => Json(serde_json::json!({
            "success": true,
            "packages": packages
        })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "error": e })),
        ).into_response(),
    }
}

/// Get details about a specific package
async fn get_package_handler(Path(package_id): Path<String>) -> impl IntoResponse {
    match packages::get_package(package_id) {
        Ok(package) => Json(serde_json::json!({
            "success": true,
            "package": package
        })).into_response(),
        Err(e) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "success": false, "error": e })),
        ).into_response(),
    }
}

/// Load a .zipp package from a file path
async fn load_package_handler(
    State(state): State<Arc<ApiState>>,
    Json(request): Json<LoadPackageRequest>,
) -> impl IntoResponse {
    // First, read and validate the package manifest
    let manifest = match packages::read_package(request.package_path.clone()) {
        Ok(m) => m,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "success": false, "error": format!("Failed to read package: {}", e) })),
            ).into_response();
        }
    };

    // Install the package (extracts to packages directory)
    let installed = match packages::install_package(request.package_path.clone(), request.trust).await {
        Ok(pkg) => pkg,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "success": false, "error": format!("Failed to install package: {}", e) })),
            ).into_response();
        }
    };

    // Auto-start services if requested
    if request.auto_start_services {
        if let Some(services_list) = &manifest.services {
            for service in services_list {
                if service.auto_start.unwrap_or(false) {
                    let service_path = std::path::Path::new(&installed.install_path)
                        .join(&service.path)
                        .to_string_lossy()
                        .to_string();

                    if let Err(e) = services::start_package_service(
                        state.app_handle.clone(),
                        manifest.id.clone(),
                        service.id.clone(),
                        service_path,
                        service.preferred_port,
                        service.env.clone(),
                    ).await {
                        eprintln!("[API] Warning: Failed to start service {}: {}", service.id, e);
                    }
                }
            }
        }
    }

    // Emit event to frontend to open the package flow
    let _ = state.app_handle.emit("package:loaded", serde_json::json!({
        "packageId": manifest.id,
        "packageName": manifest.name,
        "entryFlow": manifest.entry_flow,
    }));

    Json(serde_json::json!({
        "success": true,
        "package": installed,
        "message": format!("Package '{}' loaded successfully", manifest.name)
    })).into_response()
}

/// Close a loaded package (stop services, optionally uninstall)
async fn close_package_handler(
    State(state): State<Arc<ApiState>>,
    Path(package_id): Path<String>,
) -> impl IntoResponse {
    // Stop all services for this package
    let stopped_count = match services::stop_package_services(state.app_handle.clone(), package_id.clone()).await {
        Ok(count) => count,
        Err(e) => {
            eprintln!("[API] Warning: Failed to stop package services: {}", e);
            0
        }
    };

    // Emit event to frontend to close the package
    let _ = state.app_handle.emit("package:closed", serde_json::json!({
        "packageId": package_id,
        "stoppedServices": stopped_count,
    }));

    Json(serde_json::json!({
        "success": true,
        "packageId": package_id,
        "stoppedServices": stopped_count,
        "message": format!("Package closed, {} services stopped", stopped_count)
    })).into_response()
}

/// Run the workflow from a loaded package
async fn run_package_workflow_handler(
    State(state): State<Arc<ApiState>>,
    Path(package_id): Path<String>,
    Json(request): Json<RunPackageWorkflowRequest>,
) -> impl IntoResponse {
    // Get the installed package
    let package = match packages::get_package(package_id.clone()) {
        Ok(pkg) => pkg,
        Err(e) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "success": false, "error": format!("Package not found: {}", e) })),
            ).into_response();
        }
    };

    // Determine which flow to run
    let flow_path = request.flow_path.unwrap_or_else(|| package.manifest.entry_flow.clone());

    // Read the flow content
    let flow_content = match packages::read_package_flow(package_id.clone(), flow_path.clone()) {
        Ok(content) => content,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "success": false, "error": format!("Failed to read flow: {}", e) })),
            ).into_response();
        }
    };

    // Parse the flow
    let flow: serde_json::Value = match serde_json::from_str(&flow_content) {
        Ok(f) => f,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "success": false, "error": format!("Invalid flow JSON: {}", e) })),
            ).into_response();
        }
    };

    // Create a job to run the flow
    // We emit an event to the frontend to create and run the job
    let job_id = Uuid::new_v4().to_string();

    let _ = state.app_handle.emit("package:run-workflow", serde_json::json!({
        "jobId": job_id,
        "packageId": package_id,
        "flowPath": flow_path,
        "flow": flow,
        "inputs": request.inputs,
    }));

    Json(serde_json::json!({
        "success": true,
        "jobId": job_id,
        "packageId": package_id,
        "flowPath": flow_path,
        "message": "Workflow execution started"
    })).into_response()
}
