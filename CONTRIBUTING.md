# Contributing to Zipp

Thank you for your interest in contributing to Zipp! This guide will help you get started.

## Project Structure

Zipp is organized as a monorepo with the following packages:

```
packages/
├── zipp-desktop/        # Tauri desktop application (React + Rust)
├── zipp-core/           # Workflow engine (compiler, runtime, modules)
├── zipp-mcp-server/     # Claude MCP integration server
└── zipp-ui-components/  # Shared React UI components

formlogic-typescript/    # FormLogic expression language VM
```

### Package Responsibilities

| Package | Purpose |
|---------|---------|
| **zipp-desktop** | Desktop app UI, Tauri backend, plugin loading |
| **zipp-core** | Workflow compilation, runtime execution, module system |
| **zipp-mcp-server** | Exposes workflows to Claude via MCP protocol |
| **zipp-ui-components** | Reusable React components for workflow builders |
| **formlogic-typescript** | Sandboxed expression language for workflow execution |

## Development Setup

### Prerequisites

- Node.js 18+
- Rust (for Tauri)
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/f2i-com/zipp.git
cd zipp

# Install dependencies
npm install

# Build dependencies in order
cd formlogic-typescript && npm run build && cd ..
cd packages/zipp-core && npm run build && cd ../..
cd packages/zipp-ui-components && npm run build && cd ../..

# Build plugins
cd packages/zipp-desktop && npm run build:plugins && cd ../..

# Run in development mode
cd packages/zipp-desktop
npm run tauri dev
```

## Making Changes

### Code Style

- Use TypeScript for all new code
- Follow existing patterns in the codebase
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### Commit Messages

Write clear, concise commit messages:
- Use present tense ("Add feature" not "Added feature")
- Keep the first line under 72 characters
- Reference issues when applicable

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run tests (`npm test` in relevant packages)
5. Commit your changes
6. Push to your fork
7. Open a Pull Request

## Creating Modules

Modules add new node types to Zipp. Each module contains:

```
modules/my-module/
├── module.json      # Module manifest
├── nodes/           # Node definitions (JSON)
├── runtime.ts       # Runtime execution code
├── compiler.ts      # Compilation logic (optional)
└── ui/              # React components (optional)
```

See `packages/zipp-core/modules/README.md` for detailed documentation.

### Module Checklist

- [ ] Create `module.json` with metadata and node list
- [ ] Add node definitions in `nodes/*.json`
- [ ] Implement runtime methods in `runtime.ts`
- [ ] Add compilation templates or custom compiler
- [ ] Test with sample workflows
- [ ] Update module list if adding to core

## Testing

```bash
# Run tests for zipp-core
cd packages/zipp-core
npm test

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- --testPathPattern="compiler"
```

## Reporting Issues

When reporting issues, please include:

- Zipp version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Error messages or logs

## Questions?

- Open a GitHub Discussion for questions
- Check existing issues before creating new ones
- Join the community discussions

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
