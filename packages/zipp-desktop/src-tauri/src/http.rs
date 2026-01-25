// Shared HTTP request functionality for both desktop and CLI

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpRequest {
    pub method: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub follow_redirects: bool,
    pub max_redirects: u32,
    /// Allow requests to localhost/private networks (default: false for security)
    #[serde(default)]
    pub allow_private_networks: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub url: String,
    /// If true, body is Base64 encoded (for binary responses like images)
    #[serde(default)]
    pub body_is_base64: bool,
}

/// Result of URL validation and DNS resolution for IP pinning
struct ResolvedUrl {
    /// Whether any resolved IP is private
    is_private: bool,
    /// The hostname from the URL
    host: String,
    /// First non-private resolved IP (for pinning), if any
    /// Note: SocketAddr includes both IP and port
    pinned_addr: Option<SocketAddr>,
}

/// Check if a URL points to a private/local network address (SSRF protection)
/// This includes DNS resolution to prevent bypass via DNS rebinding attacks
/// Returns ResolvedUrl with pinning information for TOCTOU protection
fn resolve_and_validate_url(url_str: &str) -> Result<ResolvedUrl, String> {
    let parsed = url::Url::parse(url_str)
        .map_err(|e| format!("Invalid URL: {}", e))?;

    let host = parsed.host_str().unwrap_or("").to_string();
    let port = parsed.port_or_known_default().unwrap_or(80);

    // Check for localhost variants
    if host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "[::1]" {
        return Ok(ResolvedUrl {
            is_private: true,
            host,
            pinned_addr: None,
        });
    }

    // Check for common private hostnames
    if host.ends_with(".local") || host.ends_with(".internal") || host.ends_with(".localhost") {
        return Ok(ResolvedUrl {
            is_private: true,
            host,
            pinned_addr: None,
        });
    }

    // Try to parse as IP address and check private ranges
    if let Ok(ip) = host.parse::<IpAddr>() {
        let is_priv = is_private_ip(ip);
        return Ok(ResolvedUrl {
            is_private: is_priv,
            host: host.clone(),
            pinned_addr: if is_priv { None } else { Some(SocketAddr::new(ip, port)) },
        });
    }

    // For hostnames with brackets (IPv6), try stripping them
    if host.starts_with('[') && host.ends_with(']') {
        let inner = &host[1..host.len()-1];
        if let Ok(ip) = inner.parse::<IpAddr>() {
            let is_priv = is_private_ip(ip);
            return Ok(ResolvedUrl {
                is_private: is_priv,
                host: host.clone(),
                pinned_addr: if is_priv { None } else { Some(SocketAddr::new(ip, port)) },
            });
        }
    }

    // DNS Resolution Check: Resolve hostname and check if any resolved IP is private
    // This prevents SSRF bypass via DNS rebinding (e.g., local.attacker.com -> 127.0.0.1)
    let socket_addr_str = format!("{}:{}", host, port);

    if let Ok(addrs) = socket_addr_str.to_socket_addrs() {
        let addrs_vec: Vec<SocketAddr> = addrs.collect();

        // Check if ANY resolved IP is private
        for addr in &addrs_vec {
            if is_private_ip(addr.ip()) {
                return Ok(ResolvedUrl {
                    is_private: true,
                    host,
                    pinned_addr: None,
                });
            }
        }

        // All IPs are public - return the first one for pinning
        let pinned = addrs_vec.first().copied();
        return Ok(ResolvedUrl {
            is_private: false,
            host,
            pinned_addr: pinned,
        });
    }

    // DNS resolution failed - allow request but no pinning
    Ok(ResolvedUrl {
        is_private: false,
        host,
        pinned_addr: None,
    })
}

/// Legacy function for backward compatibility
fn is_private_url(url_str: &str) -> Result<bool, String> {
    let parsed = url::Url::parse(url_str)
        .map_err(|e| format!("Invalid URL: {}", e))?;

    let host = parsed.host_str().unwrap_or("");

    // Check for localhost variants
    if host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "[::1]" {
        return Ok(true);
    }

    // Check for common private hostnames
    if host.ends_with(".local") || host.ends_with(".internal") || host.ends_with(".localhost") {
        return Ok(true);
    }

    // Try to parse as IP address and check private ranges
    if let Ok(ip) = host.parse::<IpAddr>() {
        return Ok(is_private_ip(ip));
    }

    // For hostnames with brackets (IPv6), try stripping them
    if host.starts_with('[') && host.ends_with(']') {
        let inner = &host[1..host.len()-1];
        if let Ok(ip) = inner.parse::<IpAddr>() {
            return Ok(is_private_ip(ip));
        }
    }

    // DNS Resolution Check: Resolve hostname and check if any resolved IP is private
    // This prevents SSRF bypass via DNS rebinding (e.g., local.attacker.com -> 127.0.0.1)
    let port = parsed.port_or_known_default().unwrap_or(80);
    let socket_addr_str = format!("{}:{}", host, port);

    if let Ok(addrs) = socket_addr_str.to_socket_addrs() {
        for addr in addrs {
            if is_private_ip(addr.ip()) {
                return Ok(true);
            }
        }
    }

    Ok(false)
}

/// Check if an IP address is in a private range
fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ipv4) => {
            let octets = ipv4.octets();
            // 10.0.0.0/8
            if octets[0] == 10 { return true; }
            // 172.16.0.0/12
            if octets[0] == 172 && (16..=31).contains(&octets[1]) { return true; }
            // 192.168.0.0/16
            if octets[0] == 192 && octets[1] == 168 { return true; }
            // 127.0.0.0/8 (loopback)
            if octets[0] == 127 { return true; }
            // 169.254.0.0/16 (link-local, includes cloud metadata at 169.254.169.254)
            if octets[0] == 169 && octets[1] == 254 { return true; }
            // 0.0.0.0
            if octets == [0, 0, 0, 0] { return true; }
            false
        }
        IpAddr::V6(ipv6) => {
            // ::1 (loopback)
            if ipv6.is_loopback() { return true; }
            // fe80::/10 (link-local)
            let segments = ipv6.segments();
            if (segments[0] & 0xffc0) == 0xfe80 { return true; }
            // fc00::/7 (unique local)
            if (segments[0] & 0xfe00) == 0xfc00 { return true; }
            // :: (unspecified)
            if ipv6.is_unspecified() { return true; }
            false
        }
    }
}

/// Make an HTTP request with full control over headers (no browser restrictions)
pub async fn make_request(request: HttpRequest) -> Result<HttpResponse, String> {
    // SSRF Protection: Resolve DNS and validate for private networks
    // Uses IP pinning to prevent DNS rebinding TOCTOU attacks
    let resolved = resolve_and_validate_url(&request.url)?;

    if !request.allow_private_networks && resolved.is_private {
        return Err(
            "Requests to localhost/private networks are blocked for security. \
            Set 'allow_private_networks' to true if this is intentional.".to_string()
        );
    }

    let mut client_builder = reqwest::Client::builder()
        // Add timeout to prevent hanging on slow/unresponsive servers
        .timeout(std::time::Duration::from_secs(120))
        .connect_timeout(std::time::Duration::from_secs(30));

    // IP Pinning: Force connection to the resolved IP to prevent DNS rebinding
    // This ensures the actual connection uses the same IP we validated
    if let Some(pinned_addr) = resolved.pinned_addr {
        if !resolved.host.is_empty() {
            client_builder = client_builder.resolve(&resolved.host, pinned_addr);
        }
    }

    // Configure redirect policy
    let client = if request.follow_redirects {
        client_builder
            .redirect(reqwest::redirect::Policy::limited(request.max_redirects as usize))
    } else {
        client_builder.redirect(reqwest::redirect::Policy::none())
    }
    .build()
    .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Build the request
    let method = match request.method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        "HEAD" => reqwest::Method::HEAD,
        "OPTIONS" => reqwest::Method::OPTIONS,
        _ => return Err(format!("Unsupported HTTP method: {}", request.method)),
    };

    let mut req_builder = client.request(method, &request.url);

    // Add all headers (including Origin, Referer, etc. - no restrictions!)
    for (key, value) in &request.headers {
        req_builder = req_builder.header(key, value);
    }

    // Add body if present
    if let Some(body) = &request.body {
        req_builder = req_builder.body(body.clone());
    }

    // Execute the request
    let response = req_builder
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status().as_u16();
    let final_url = response.url().to_string();

    // TOCTOU Defense: Re-check final URL for private networks
    // This catches DNS rebinding attacks where the hostname resolves to a different IP
    // between our security check and the actual connection
    if !request.allow_private_networks
        && is_private_url(&final_url)? {
            return Err(
                "Request was redirected to a private network address. \
                This could indicate a DNS rebinding attack.".to_string()
            );
        }

    // Collect response headers
    let mut response_headers = HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(v) = value.to_str() {
            response_headers.insert(key.to_string(), v.to_string());
        }
    }

    // Check content-type to determine if response is likely binary
    let content_type = response_headers
        .get("content-type")
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    let is_binary_content_type = content_type.starts_with("image/")
        || content_type.starts_with("audio/")
        || content_type.starts_with("video/")
        || content_type.starts_with("application/octet-stream")
        || content_type.starts_with("application/pdf")
        || content_type.starts_with("application/zip")
        || content_type.starts_with("application/gzip")
        || content_type.starts_with("application/x-tar")
        || content_type.starts_with("font/");

    // Read response as bytes to handle both text and binary
    let body_bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    // Determine if we should return as Base64:
    // 1. If content-type indicates binary, OR
    // 2. If bytes are not valid UTF-8
    let (body, body_is_base64) = if is_binary_content_type {
        // Binary content-type: always encode as Base64
        (BASE64.encode(&body_bytes), true)
    } else {
        // Try to decode as UTF-8
        match String::from_utf8(body_bytes.to_vec()) {
            Ok(text) => (text, false),
            Err(_) => {
                // Not valid UTF-8, encode as Base64
                (BASE64.encode(&body_bytes), true)
            }
        }
    };

    Ok(HttpResponse {
        status,
        headers: response_headers,
        body,
        url: final_url,
        body_is_base64,
    })
}
