# Zipp MCP Server

An MCP (Model Context Protocol) server that exposes Zipp workflow capabilities to Claude. This enables Claude (via Claude Desktop or Claude Code) to create, modify, run, and debug workflows conversationally.

## Features

- **Workflow Management**: Create, list, get, and delete workflows
- **Node Operations**: Add, update, delete nodes and connections
- **Execution**: Run workflows, check status, get logs
- **FlowPlan Support**: Work with AI-friendly FlowPlan DSL
- **Introspection**: List available nodes, modules, and capabilities
- **Claude-as-AI**: Let Claude substitute for AI nodes in workflows

## Installation

```bash
cd packages/zipp-mcp-server
npm install
npm run build
```

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "zipp": {
      "command": "node",
      "args": ["/path/to/zipp/packages/zipp-mcp-server/dist/index.js"],
      "env": {
        "ZIPP_API_URL": "http://localhost:3000",
        "ZIPP_API_KEY": "optional-api-key"
      }
    }
  }
}
```

### Claude Code

The MCP server can also be used with Claude Code by configuring it in your project's MCP settings.

## Usage

### Prerequisites

1. Start the Zipp desktop application (this enables the API server on port 3000)
2. Ensure the MCP server is configured in Claude Desktop/Code

### Example Conversations

**List workflows:**
> "What workflows do I have in Zipp?"

**Create a workflow:**
> "Create a new workflow called 'Image Processor' that reads images from a folder and describes them using AI"

**Run a workflow:**
> "Run the Image Processor workflow with the input folder set to /Users/me/photos"

**Debug a failure:**
> "The workflow failed. Can you check the logs and tell me what went wrong?"

**Claude-as-AI mode:**
> "Run the workflow but use yourself for the AI completions instead of the external API"

## Available Tools

### Workflow Management
| Tool | Description |
|------|-------------|
| `list_workflows` | List all workflows |
| `get_workflow` | Get workflow details |
| `create_workflow` | Create new workflow |
| `delete_workflow` | Delete a workflow |

### Node Operations
| Tool | Description |
|------|-------------|
| `add_node` | Add a node to workflow |
| `update_node` | Update node configuration |
| `delete_node` | Remove a node |
| `connect_nodes` | Create connection between nodes |
| `disconnect_nodes` | Remove a connection |

### Execution
| Tool | Description |
|------|-------------|
| `run_workflow` | Execute a workflow |
| `continue_workflow` | Continue after AI yield |
| `stop_workflow` | Abort running workflow |
| `get_job_status` | Get execution status |
| `get_job_logs` | Get execution logs |

### FlowPlan
| Tool | Description |
|------|-------------|
| `create_workflow_from_description` | Generate workflow from text |
| `get_workflow_as_flowplan` | Export as FlowPlan DSL |
| `apply_flowplan` | Import FlowPlan DSL |

### Introspection
| Tool | Description |
|------|-------------|
| `list_available_nodes` | List node types |
| `get_node_definition` | Get node details |
| `list_modules` | List loaded modules |
| `validate_workflow` | Check for errors |

## Claude-as-AI Pattern

When you run a workflow with `useClaudeForAI: true`, AI nodes will yield control back to Claude instead of calling external APIs. This allows Claude to:

1. See the full context of the workflow
2. Reason about the best response
3. Handle image/vision tasks directly
4. Fix issues before continuing

**Example:**
```
Claude: run_workflow("my-flow", { useClaudeForAI: true })

Server: {
  "status": "awaiting_ai",
  "message": "Workflow paused at AI node",
  "nodeId": "describe_image",
  "prompt": "Describe this image in detail",
  "image": "base64...",
  "continueToken": "abc123"
}

Claude: [Analyzes the image]
Claude: continue_workflow("abc123", "This image shows a sunset over mountains...")

Server: { "status": "completed", "outputs": {...} }
```

## Resources

The server also exposes MCP resources:

| URI | Description |
|-----|-------------|
| `zipp://workflows` | All workflows |
| `zipp://workflows/{id}` | Specific workflow |
| `zipp://nodes` | Available node types |
| `zipp://modules` | Loaded modules |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ZIPP_API_URL` | Zipp API server URL | `http://localhost:3000` |
| `ZIPP_API_KEY` | Optional API key | (none) |

## Development

```bash
# Watch mode
npm run dev

# Build
npm run build

# Run with debugging
npm run inspect
```

## Troubleshooting

### "Cannot connect to Zipp"
- Make sure the Zipp desktop app is running
- Check that the API server is enabled (default port 3000)
- Verify the `ZIPP_API_URL` environment variable

### "API key required"
- Set the `ZIPP_API_KEY` environment variable if Zipp has API authentication enabled

### Tools not appearing in Claude
- Restart Claude Desktop after adding the MCP configuration
- Check the MCP server logs for errors

## License

Apache 2.0
