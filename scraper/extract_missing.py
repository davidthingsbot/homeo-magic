#!/usr/bin/env python3
"""Extract passages for missing remedies only."""

import json
import subprocess
import sys
from pathlib import Path

REPO_DIR = Path(__file__).parent.parent
MD_DIR = REPO_DIR / "data" / "kent" / "materia_medica" / "remedy_markdown"
PASS_DIR = REPO_DIR / "data" / "kent" / "materia_medica" / "passages"

def get_done():
    done = set()
    for bf in PASS_DIR.glob("batch_*.json"):
        with open(bf) as f:
            data = json.load(f)
        done.update(data.keys())
    return done

def extract_passages_llm(remedy_name, remedy_text):
    prompt = f"""You are a homeopathic text analyst. Read this Kent lecture on {remedy_name}.

Extract EVERY distinct clinical passage or observation. For each one, provide:
1. "keywords": array of relevant body systems, symptoms, and modalities mentioned (lowercase)
2. "passage": Kent's exact words (cleaned up slightly, 1-3 sentences max)

Output as a JSON array: [{{"keywords": [...], "passage": "..."}}, ...]
Be thorough. Output ONLY valid JSON array."""

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
        return json.loads(output[start:end])
    except (ValueError, json.JSONDecodeError) as e:
        return [{"error": str(e)}]

def main():
    batch_num = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    total = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    
    done = get_done()
    all_files = sorted(MD_DIR.glob("*.md"))
    missing = [f for f in all_files if f.stem not in done]
    
    # Split for this batch
    size = len(missing) // total
    start = batch_num * size
    end = len(missing) if batch_num == total - 1 else start + size
    batch = missing[start:end]
    
    print(f"[Batch {batch_num+1}/{total}] {len(batch)} missing remedies to process")
    
    results = {}
    for i, filepath in enumerate(batch, 1):
        text = filepath.read_text()
        first_line = text.split("\n")[0]
        name = first_line.replace("# ", "").strip() if first_line.startswith("# ") else filepath.stem.replace("_", " ").title()
        
        print(f"  [{batch_num+1}] ({i}/{len(batch)}) {name}...")
        passages = extract_passages_llm(name, text)
        results[filepath.stem] = {"remedy": name, "passages": passages, "count": len(passages)}
        
        # Save incrementally
        with open(PASS_DIR / f"missing_{batch_num}.json", "w") as f:
            json.dump(results, f, indent=2)
        
        print(f"  [{batch_num+1}] Done: {name} ({len(passages)} passages)")
    
    print(f"\n[Batch {batch_num+1}/{total}] COMPLETE. {len(results)} remedies.")

if __name__ == "__main__":
    main()
