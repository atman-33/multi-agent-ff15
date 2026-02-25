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

Configure `cocoindex-code` in your MCP settings file.

### OpenCode Configuration

This is the most reliable approach for use with OpenCode. Configure in `opencode.json`:

```json
{
  "mcp": {
    "cocoindex-code": {
      "type": "local",
      "command": [
        "./.venv/bin/cocoindex-code"
      ],
      "enabled": true
    }
  }
}
```

**Advantages:**
- ✅ Works with OpenCode framework
- ✅ Relative path is clean and repository-portable
- ✅ Most stable configuration
- ✅ No timeout issues
- ✅ Recommended for this project

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

1. **For OpenCode**: Verify `opencode.json` has the correct configuration with relative path `./.venv/bin/cocoindex-code`
2. **For VS Code**: Verify the path in your MCP configuration is absolute and correct
3. Check that `.venv/bin/cocoindex-code` exists and is executable
4. Try running the command directly: `/full/path/to/.venv/bin/cocoindex-code --help`
5. Check for Python version compatibility (Python 3.9+ recommended)

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

- **For this project**: Use Method 1 (OpenCode configuration in `opencode.json`) - it's the most reliable and recommended approach
- The OpenCode approach with relative path is portable across different machines and environments
- Ensure Python 3.9 or later is available in your environment
- The virtual environment must be in the project directory or adjusted in the configuration path
- If experiencing issues with VS Code or other editors, try the OpenCode approach instead
