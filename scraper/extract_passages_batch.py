#!/usr/bin/env python3
"""
Extract ALL distinct passages from each Kent remedy chapter.
Each passage gets tagged with keywords for later matching.
This is the pre-computation step - extraction, not matching.

Usage: python3 extract_passages_batch.py <batch_num> <total_batches>
"""

import json
import sys
import subprocess
from pathlib import Path

REPO_DIR = Path(__file__).parent.parent
DATA_DIR = REPO_DIR / "data"
MM_DIR = DATA_DIR / "kent" / "materia_medica"
MD_DIR = MM_DIR / "remedy_markdown"
OUTPUT_DIR = MM_DIR / "passages"

def get_md_files():
    return sorted(MD_DIR.glob("*.md"))

def extract_passages_llm(remedy_name, remedy_text):
    """Use LLM to extract all distinct clinical passages with keyword tags."""
    
    prompt = f"""You are a homeopathic text analyst. Read this Kent lecture on {remedy_name}.

Extract EVERY distinct clinical passage or observation. For each one, provide:
1. "keywords": array of relevant body systems, symptoms, and modalities mentioned (lowercase). Include: body parts (mind, head, stomach, bladder, urine, stool, etc.), symptoms (pain, burning, thirst, etc.), modalities (worse, better, morning, etc.)
2. "passage": Kent's exact words (cleaned up slightly for readability, 1-3 sentences max)

Output as a JSON array of objects: [{{"keywords": [...], "passage": "..."}}, ...]

Be thorough - extract EVERY clinical observation, not just the major ones. Include mental symptoms, modalities, relationships to other remedies, and constitutional descriptions.

Output ONLY valid JSON array, no commentary."""

    result = subprocess.run(
        ["claude", "--permission-mode", "bypassPermissions", "--print", prompt],
        input=remedy_text,
        capture_output=True,
        text=True,
        timeout=300
    )
    
    output = result.stdout.strip()
    try:
        start = output.index("[")
        end = output.rindex("]") + 1
        passages = json.loads(output[start:end])
        return passages
    except (ValueError, json.JSONDecodeError) as e:
        return [{"error": str(e), "raw_length": len(output)}]

def main():
    if len(sys.argv) != 3:
        print("Usage: python3 extract_passages_batch.py <batch_num> <total_batches>")
        sys.exit(1)
    
    batch_num = int(sys.argv[1])
    total_batches = int(sys.argv[2])
    
    files = get_md_files()
    batch_size = len(files) // total_batches
    start = batch_num * batch_size
    end = len(files) if batch_num == total_batches - 1 else start + batch_size
    batch = files[start:end]
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    print(f"[Batch {batch_num+1}/{total_batches}] Extracting passages from {len(batch)} remedies")
    
    results = {}
    for i, filepath in enumerate(batch, 1):
        text = filepath.read_text()
        # Get remedy name from first line
        first_line = text.split("\n")[0]
        name = first_line.replace("# ", "").strip() if first_line.startswith("# ") else filepath.stem.replace("_", " ").title()
        
        print(f"  [{batch_num+1}] ({i}/{len(batch)}) Extracting: {name}...")
        
        passages = extract_passages_llm(name, text)
        results[filepath.stem] = {
            "remedy": name,
            "passages": passages,
            "count": len(passages)
        }
        
        # Save incrementally
        output_file = OUTPUT_DIR / f"batch_{batch_num}.json"
        with open(output_file, "w") as f:
            json.dump(results, f, indent=2)
        
        print(f"  [{batch_num+1}] Done: {name} ({len(passages)} passages)")
    
    print(f"\n[Batch {batch_num+1}/{total_batches}] COMPLETE. {len(results)} remedies processed.")

if __name__ == "__main__":
    main()
