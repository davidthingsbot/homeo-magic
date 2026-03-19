#!/usr/bin/env python3
"""
Repertorization engine: find remedies matching multiple symptoms.
"""

import json
from pathlib import Path
from collections import defaultdict

def load_data():
    """Load symptoms and remedies from JSON files."""
    data_dir = Path(__file__).parent.parent / "data"
    
    with open(data_dir / "symptoms.json") as f:
        symptoms = json.load(f)
    
    with open(data_dir / "remedies.json") as f:
        remedies = json.load(f)
    
    return symptoms, remedies

def search_symptoms(query: str, symptoms: dict, limit: int = 10) -> list[str]:
    """Search for symptoms matching a query string."""
    query = query.lower()
    matches = []
    
    for symptom in symptoms.keys():
        if query in symptom.lower():
            matches.append(symptom)
            if len(matches) >= limit:
                break
    
    return matches

def repertorize(selected_symptoms: list[str], symptoms: dict, remedies: dict) -> list[tuple[str, int, dict]]:
    """
    Find remedies that appear in ALL selected symptoms.
    Returns list of (remedy_abbrev, total_score, breakdown) sorted by score descending.
    """
    if not selected_symptoms:
        return []
    
    # Gather remedy scores per symptom
    remedy_scores = defaultdict(lambda: {"total": 0, "breakdown": {}})
    remedy_presence = defaultdict(set)  # track which symptoms each remedy appears in
    
    for symptom in selected_symptoms:
        if symptom not in symptoms:
            print(f"Warning: symptom not found: {symptom}")
            continue
        
        for remedy_abbrev, weight in symptoms[symptom]["remedies"].items():
            remedy_scores[remedy_abbrev]["total"] += weight
            remedy_scores[remedy_abbrev]["breakdown"][symptom] = weight
            remedy_presence[remedy_abbrev].add(symptom)
    
    # Filter to only remedies present in ALL symptoms
    num_symptoms = len(selected_symptoms)
    results = []
    
    for remedy_abbrev, scores in remedy_scores.items():
        if len(remedy_presence[remedy_abbrev]) == num_symptoms:
            full_name = remedies.get(remedy_abbrev, remedy_abbrev)
            results.append((remedy_abbrev, scores["total"], scores["breakdown"], full_name))
    
    # Sort by total score descending
    results.sort(key=lambda x: -x[1])
    
    return results

def demo():
    """Run a demo repertorization."""
    print("Loading data...")
    symptoms, remedies = load_data()
    print(f"Loaded {len(symptoms)} symptoms, {len(remedies)} remedies\n")
    
    # Demo: search for symptoms
    print("=== Searching for 'headache' ===")
    matches = search_symptoms("headache", symptoms, limit=15)
    for m in matches:
        print(f"  {m}")
    
    print("\n=== Searching for 'irritab' ===")
    matches = search_symptoms("irritab", symptoms, limit=10)
    for m in matches:
        print(f"  {m}")
    
    print("\n=== Searching for 'cold, agg' ===")
    matches = search_symptoms("cold, agg", symptoms, limit=10)
    for m in matches:
        print(f"  {m}")
    
    # Demo repertorization
    print("\n" + "="*60)
    print("DEMO REPERTORIZATION")
    print("="*60)
    
    selected = [
        "Head, pain, morning",
        "Mind, irritability",
        "Generalities, cold, in general agg."
    ]
    
    print(f"\nSelected symptoms:")
    for s in selected:
        print(f"  • {s}")
    
    results = repertorize(selected, symptoms, remedies)
    
    print(f"\nResults ({len(results)} remedies in intersection):\n")
    
    for i, (abbrev, score, breakdown, name) in enumerate(results[:15], 1):
        breakdown_str = " + ".join(f"{s.split(',')[0]}({w})" for s, w in breakdown.items())
        print(f"  {i:2}. {abbrev:12} {score:3} pts  ({name})")
        print(f"      {breakdown_str}")

if __name__ == "__main__":
    demo()
