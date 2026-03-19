# Homeo-Magic

A structured database and lookup tool for homeopathic repertorization — finding remedies by symptom intersection.

## How Repertorization Works

The clinical workflow:

1. **Patient presents** with multiple symptoms
2. **Look up each symptom** in a repertory (like Kent's)
3. **Each symptom returns** a list of remedies (with grades)
4. **Find the intersection** — remedies that appear for ALL symptoms
5. **Rank by total score** — sum of grades across symptoms

### Example

```
Patient symptoms:
  1. "headache, worse in morning"
  2. "irritability" 
  3. "worse from cold"

Lookup results:
  Symptom 1: [Nux-v(3), Bry(2), Puls(1), Nat-m(2), Calc(1)]
  Symptom 2: [Nux-v(3), Cham(3), Bry(2), Sep(2), Lyc(1)]
  Symptom 3: [Nux-v(2), Ars(3), Hep(2), Sil(1), Psor(1)]

Intersection:
  Nux-v — appears in all three (score: 3+3+2 = 8)

Recommendation: Nux vomica
```

The grade (1-3) indicates remedy strength for that symptom:
- **Grade 3** (bold): Primary/strongly indicated
- **Grade 2** (italic): Secondary indication  
- **Grade 1** (plain): Minor/occasional indication

---

## Data Model

```json
{
  "symptoms": {
    "head/pain/morning": {
      "remedies": {
        "Nux-v": 3,
        "Bry": 2,
        "Puls": 1,
        "Nat-m": 2,
        "Calc": 1
      },
      "chapter": "Head",
      "section": "Pain",
      "subsection": "Morning"
    }
  }
}
```

### Index Files

| File | Purpose |
|------|---------|
| `symptoms.json` | Main index: symptom path → remedies + grades |
| `search_index.json` | Keyword search for finding symptoms |
| `hierarchy.json` | Browsable tree structure |
| `remedies.json` | Remedy abbreviations → full names |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   homeo-magic                    │
├─────────────────────────────────────────────────┤
│  1. SCRAPER                                      │
│     - Fetch Kent's Repertory (chapter by chapter)│
│     - Parse symptom hierarchy (Head > Pain > AM) │
│     - Extract remedies + grades                  │
│     - Output: symptoms.json                      │
├─────────────────────────────────────────────────┤
│  2. INDEX                                        │
│     - symptoms.json: symptom → remedies + grades │
│     - search_index.json: keyword search          │
│     - hierarchy.json: browsable tree             │
├─────────────────────────────────────────────────┤
│  3. LOOKUP ENGINE                                │
│     - Input: list of symptoms                    │
│     - Output: ranked intersection                │
│     - Score = sum of grades across symptoms      │
├─────────────────────────────────────────────────┤
│  4. WEB UI (static site)                         │
│     - Search/browse symptoms                     │
│     - Select multiple                            │
│     - Show intersection with scores              │
└─────────────────────────────────────────────────┘
```

---

## Data Sources

### Primary: Kent's Repertory

James Tyler Kent's *Repertory of the Homeopathic Materia Medica* (1897) — the most widely used classical repertory.

**Potential sources:**
- **OOREP** (oorep.com) — may have structured/downloadable data
- **homeoint.org** — full text but messy HTML structure
- **materiamedica.info** — cleaner formatting

### Secondary (future)

- Murphy's Repertory (modern, expanded)
- Boger-Boenninghausen
- Synthesis

---

## Project Structure

```
homeo-magic/
├── data/
│   ├── symptoms.json       # Main symptom → remedy index
│   ├── search_index.json   # Keyword search
│   ├── hierarchy.json      # Browsable tree
│   └── remedies.json       # Abbreviation mappings
├── scraper/
│   ├── kent.py             # Kent's Repertory scraper
│   └── utils.py            # Parsing utilities
├── engine/
│   └── repertorize.py      # Intersection + scoring logic
├── web/
│   ├── index.html          # Lookup UI
│   ├── app.js
│   └── styles.css
└── README.md
```

---

## Development Phases

### Phase 1: Data Acquisition
- [ ] Investigate OOREP's data format (may have downloadable JSON)
- [ ] If not, build Kent scraper for cleanest available source
- [ ] Parse symptom hierarchy + remedy grades
- [ ] Output raw symptoms.json

### Phase 2: Index & Search
- [ ] Build keyword search index
- [ ] Implement fuzzy matching for symptom lookup
- [ ] Build intersection algorithm with grade-based scoring

### Phase 3: Web UI
- [ ] Static site (GitHub Pages)
- [ ] Symptom search/autocomplete
- [ ] Multi-select symptoms
- [ ] Show ranked remedy intersection

---

## Open Questions

1. **Source**: Can we get structured data from OOREP, or must we scrape?
2. **Scope**: Start with Kent only, or include other repertories?
3. **Grading**: Preserve full 1-3 grades, or simplify?
4. **Remedies**: Include all ~1500, or focus on polychrests (~100 major)?

---

## Status

🚧 **Planning** — data source investigation next

---

## Appendix: Origin

### Original Prompts

> What are the online free resources for homeopathy practitioners — in particular, things that relate symptoms to fixes

> Take a look at a few of the free books. Can you extract symptoms and relate them to treatments?

> Make a new repo in work, call it Homeo-Magic.

> So the way that these books work is that you look up the symptoms the person presents with in one of the repertories. Then you gather up the suggested remedies for each of the symptoms and then you do the intersection, namely, all the remedies that are in common and then you produce that list. So the scraper that we want to use on Kent has to be designed to be able to access the reference by symptom and reply with remedies — the scraper has to be organized that way.

---

## License

Data sources are public domain (pre-1927). Code is MIT.
