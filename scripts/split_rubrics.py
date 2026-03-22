#!/usr/bin/env python3
"""Split monolithic data files into smaller chunks for lazy loading."""

import json
import os
import re
import shutil
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")


def split_rubrics():
    """Split symptoms.json into body_system/subcategory.json files + index."""
    src = os.path.join(DATA_DIR, "symptoms.json")
    out_dir = os.path.join(DATA_DIR, "rubrics")
    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir, exist_ok=True)

    with open(src) as f:
        rubrics = json.load(f)

    # Group by body_system and subcategory
    groups = defaultdict(lambda: defaultdict(dict))
    for name, data in rubrics.items():
        parts = name.split(", ")
        body_system = parts[0]
        subcategory = parts[1] if len(parts) > 1 else "_root"
        groups[body_system][subcategory][name] = data

    # Write split files
    for body_system, subcats in groups.items():
        bs_dir = os.path.join(out_dir, body_system)
        os.makedirs(bs_dir, exist_ok=True)
        for subcat, entries in subcats.items():
            # Sanitize filename
            safe_name = re.sub(r'[^\w\s\-.]', '', subcat).strip()
            if not safe_name:
                safe_name = "_other"
            path = os.path.join(bs_dir, f"{safe_name}.json")
            # If file already exists (name collision), merge
            if os.path.exists(path):
                with open(path) as f:
                    existing = json.load(f)
                existing.update(entries)
                entries = existing
            with open(path, "w") as f:
                json.dump(entries, f, separators=(",", ":"))

    # Write index: compact encoded list (under 2 MB)
    # Format: each entry is "pairIdx:remaining" where pairIdx is base-36
    # encoded body_system+subcategory pair, sorted by frequency for compactness.
    # The pairs mapping is stored as the first entry (JSON string).
    from collections import Counter

    pair_counts = Counter()
    for name in rubrics:
        parts = name.split(", ", 2)
        pair = parts[0] + ", " + parts[1] if len(parts) > 1 else parts[0]
        pair_counts[pair] += 1

    sorted_pairs = [p for p, _ in pair_counts.most_common()]
    pair_map = {p: i for i, p in enumerate(sorted_pairs)}

    def to_base36(n):
        if n == 0:
            return "0"
        digits = "0123456789abcdefghijklmnopqrstuvwxyz"
        result = ""
        while n > 0:
            result = digits[n % 36] + result
            n //= 36
        return result

    # Store pairs mapping separately for client-side decoding (not in rubrics dir)
    with open(os.path.join(DATA_DIR, "rubric_pairs.json"), "w") as f:
        json.dump(sorted_pairs, f, separators=(",", ":"))

    encoded = []
    for name in sorted(rubrics.keys()):
        parts = name.split(", ", 2)
        pair = parts[0] + ", " + parts[1] if len(parts) > 1 else parts[0]
        remaining = parts[2] if len(parts) > 2 else ""
        idx = to_base36(pair_map[pair])
        if remaining:
            encoded.append(f"{idx}:{remaining}")
        else:
            encoded.append(idx)

    with open(os.path.join(out_dir, "index.json"), "w") as f:
        json.dump(encoded, f, separators=(",", ":"))

    print(f"Split {len(rubrics)} rubrics into {len(groups)} body systems")


def split_remedies():
    """Split remedies.json into first_letter/abbrev.json files + index."""
    src = os.path.join(DATA_DIR, "remedies.json")
    out_dir = os.path.join(DATA_DIR, "remedies")
    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir, exist_ok=True)

    with open(src) as f:
        remedies = json.load(f)

    # Write index (abbreviation -> full name)
    with open(os.path.join(out_dir, "index.json"), "w") as f:
        json.dump(remedies, f, separators=(",", ":"))

    # Write individual files
    for abbrev, full_name in remedies.items():
        first_letter = abbrev[0].upper()
        letter_dir = os.path.join(out_dir, first_letter)
        os.makedirs(letter_dir, exist_ok=True)
        # Sanitize filename - replace dots and special chars
        safe_name = re.sub(r'[^\w\-.]', '_', abbrev)
        path = os.path.join(letter_dir, f"{safe_name}.json")
        with open(path, "w") as f:
            json.dump({abbrev: full_name}, f, separators=(",", ":"))

    print(f"Split {len(remedies)} remedies")


def split_kent():
    """Split Kent materia medica data per remedy."""
    kent_dir = os.path.join(DATA_DIR, "kent", "materia_medica")
    split_dir = os.path.join(kent_dir, "split")

    for data_type in ["passage_index", "profiles", "rubric_index"]:
        src = os.path.join(kent_dir, f"{data_type}.json")
        if not os.path.exists(src):
            print(f"Skipping {data_type} (file not found)")
            continue

        out = os.path.join(split_dir, data_type)
        os.makedirs(out, exist_ok=True)

        with open(src) as f:
            data = json.load(f)

        for remedy_key, remedy_data in data.items():
            safe_name = re.sub(r'[^\w\-.]', '_', remedy_key)
            path = os.path.join(out, f"{safe_name}.json")
            with open(path, "w") as f:
                json.dump({remedy_key: remedy_data}, f, separators=(",", ":"))

        print(f"Split {data_type}: {len(data)} remedies")


if __name__ == "__main__":
    split_rubrics()
    split_remedies()
    split_kent()
    print("Done!")
