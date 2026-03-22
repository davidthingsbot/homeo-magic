#!/bin/bash
# Build static site (simple HTML version)
set -e

cd "$(dirname "$0")/.."

echo "Building static site..."

# Clean output
rm -rf out
mkdir -p out/data

# Copy static files
cp public/index.html out/
cp public/*.svg out/ 2>/dev/null || true
cp public/*.ico out/ 2>/dev/null || true

# Copy data
# Legacy monolithic file (source input format)
cp ../data/symptoms.json out/data/
cp ../data/remedies.json out/data/

echo "Build complete!"
ls -lh out/
