#!/bin/bash
# GLM Usage Collector - Wrapper Script
# This script ensures environment variables are loaded before running the collector

# Explicitly export the required environment variables
# These should already be set in your shell from GLM Coding Plan setup
export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-https://api.z.ai/api/anthropic}"
export ANTHROPIC_AUTH_TOKEN="$ANTHROPIC_AUTH_TOKEN"

# Check if variables are set
if [ -z "$ANTHROPIC_AUTH_TOKEN" ]; then
    echo "Error: ANTHROPIC_AUTH_TOKEN is not set"
    echo "Please set it in your shell profile (~/.zshrc or ~/.bashrc):"
    echo '  export ANTHROPIC_AUTH_TOKEN="your-token-here"'
    exit 1
fi

# Run the collector
node scripts/usage-collector.mjs
