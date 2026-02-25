# MCP cocoindex-code Installation and Configuration

This guide provides step-by-step instructions for installing and configuring the `cocoindex-code` Model Context Protocol (MCP) server in the multi-agent-ff15 project.

## Overview

`cocoindex-code` is an MCP server that provides code indexing capabilities. It requires Python, a virtual environment, and proper MCP configuration.

## Installation Steps

### 1. Create Virtual Environment

Create and activate a virtual environment using `uv`:

```bash
cd /path/to/multi-agent-ff15
uv venv
source .venv/bin/activate
```

### 2. Install cocoindex (Prerequisite)

Install the base `cocoindex` package. The README recommends version `>=1.0.0a18`:

```bash
uv pip install "cocoindex>=1.0.0a18"
```

### 3. Install cocoindex-code

Install the cocoindex-code MCP server:

```bash
uv pip install cocoindex-code
```

### 4. Verify Installation

Confirm the installation was successful:

```bash
cocoindex-code --help
```

You should see help output from the cocoindex-code command.

## Verifying Manual Installation

If you've already executed the installation steps above, verify the executable exists:

```bash
ls .venv/bin/cocoindex-code
```

This should display the path to the executable if installation succeeded.

## MCP Configuration

Configure `cocoindex-code` in your MCP settings file. There are two recommended approaches:

### Method 1: Direct Executable Path (Recommended)

This is the most stable and reliable approach. Use the absolute path to the virtual environment's executable:

```json
{
  "mcpServers": {
    "cocoindex-code": {
      "command": "/home/<your-username>/repos/multi-agent-ff15/.venv/bin/cocoindex-code",
      "args": []
    }
  }
}
```

**Replace `<your-username>` with your actual username.**

**Advantages:**
- ✅ Most reliable and stable
- ✅ No dependency resolution overhead after initial installation
- ✅ Fast startup time
- ✅ No timeout issues
- ✅ No shell dependency

### Method 2: Explicit Virtual Environment Activation

If you prefer to avoid absolute paths, you can explicitly activate the virtual environment in the command:

```json
{
  "mcpServers": {
    "cocoindex-code": {
      "command": "bash",
      "args": [
        "-lc",
        "source .venv/bin/activate && cocoindex-code"
      ]
    }
  }
}
```

**Disadvantages:**
- ⚠️ Adds shell dependency
- ⚠️ Slightly slower startup time
- ⚠️ More environment-dependent behavior
- ⚠️ May have path resolution issues depending on shell configuration

## Troubleshooting

### Command Not Found

If `cocoindex-code --help` fails with "command not found":

1. Ensure the virtual environment is activated: `source .venv/bin/activate`
2. Verify the installation: `pip list | grep cocoindex-code`
3. If not installed, retry the installation steps

### MCP Server Won't Start

If the MCP server fails to start:

1. Verify the path in `mcp.json` is absolute and correct
2. Check that `.venv/bin/cocoindex-code` exists and is executable
3. Try running the command directly: `/full/path/to/.venv/bin/cocoindex-code --help`
4. Check for Python version compatibility (Python 3.9+ recommended)

### Virtual Environment Issues

If you encounter virtual environment issues:

```bash
# Create a fresh virtual environment
rm -rf .venv
uv venv
source .venv/bin/activate
uv pip install "cocoindex>=1.0.0a18" cocoindex-code
```

## References

- [cocoindex GitHub Repository](https://github.com/coderabbit214/cocoindex)
- MCP Documentation (if available in the project)

## Notes

- The absolute path method (Method 1) is recommended for production use
- Ensure Python 3.9 or later is available in your environment
- The virtual environment must be in the project directory or adjusted in the configuration path
