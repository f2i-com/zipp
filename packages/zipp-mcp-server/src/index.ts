#!/usr/bin/env node
/**
 * Zipp MCP Server Entry Point
 *
 * This server exposes Zipp workflow capabilities to Claude via the Model Context Protocol.
 * It enables Claude to create, modify, run, and debug workflows conversationally.
 *
 * Usage:
 *   node dist/index.js
 *
 * Environment Variables:
 *   ZIPP_API_URL  - Zipp API URL (default: http://localhost:3000)
 *   ZIPP_API_KEY  - Optional API key for authentication
 *
 * Claude Desktop Configuration:
 *   Add to claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "zipp": {
 *         "command": "node",
 *         "args": ["/path/to/zipp-mcp-server/dist/index.js"],
 *         "env": {
 *           "ZIPP_API_URL": "http://localhost:3000"
 *         }
 *       }
 *     }
 *   }
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main() {
  // Create the MCP server
  const server = createServer();

  // Create stdio transport for communication with Claude
  const transport = new StdioServerTransport();

  // Connect the server to the transport
  await server.connect(transport);

  // Log startup (to stderr so it doesn't interfere with MCP protocol on stdout)
  console.error('Zipp MCP Server started');
  console.error(`API URL: ${process.env.ZIPP_API_URL || 'http://localhost:3000'}`);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.error('Shutting down...');
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('Shutting down...');
    await server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
