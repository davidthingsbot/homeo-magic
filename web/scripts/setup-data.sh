#!/bin/bash
# Copy split data files from ../data to public/data for lazy loading.
# Run this before `npm run dev` or `npm run build`

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$WEB_DIR/../data"
PUBLIC_DATA="$WEB_DIR/public/data"

mkdir -p "$PUBLIC_DATA"

echo "Copying split rubric data..."
# Copy rubric_pairs.json (needed for client-side index decoding)
cp "$DATA_DIR/rubric_pairs.json" "$PUBLIC_DATA/"

# Copy split rubric directories (body systems with subcategory files + index)
rm -rf "$PUBLIC_DATA/rubrics"
cp -r "$DATA_DIR/rubrics" "$PUBLIC_DATA/rubrics"

echo "Copying split remedy data..."
# Copy split remedy directories (letter dirs + index)
rm -rf "$PUBLIC_DATA/remedies"
cp -r "$DATA_DIR/remedies" "$PUBLIC_DATA/remedies"

# Copy default symptoms if it exists
if [ -f "$PUBLIC_DATA/default-symptoms.json" ]; then
  echo "default-symptoms.json already present."
elif [ -f "$DATA_DIR/default-symptoms.json" ]; then
  cp "$DATA_DIR/default-symptoms.json" "$PUBLIC_DATA/"
fi

# Copy Kent materia medica data
KENT_DATA="$DATA_DIR/kent/materia_medica"
PUBLIC_KENT="$PUBLIC_DATA/kent"

if [ -d "$KENT_DATA" ]; then
  mkdir -p "$PUBLIC_KENT/remedy_markdown"
  cp "$KENT_DATA/profiles.json" "$PUBLIC_KENT/"
  cp "$KENT_DATA/rubric_index.json" "$PUBLIC_KENT/"
  cp "$KENT_DATA/remedy_markdown/"*.md "$PUBLIC_KENT/remedy_markdown/"
  echo "Kent materia medica data copied."
fi

echo "Done! Split data files copied to public/data/"
echo "Rubric body systems:"
ls "$PUBLIC_DATA/rubrics/" | head -10
echo "..."
echo "Remedy letter dirs:"
ls "$PUBLIC_DATA/remedies/" | head -10
echo "..."
