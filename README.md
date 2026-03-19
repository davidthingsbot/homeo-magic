# Homeo-Magic

A structured database of homeopathic remedies and symptoms, extracted from public domain materia medica texts.

## Goal

Create a searchable symptom → remedy lookup tool, built from classical homeopathy texts.

## Data Sources

- **Boericke's Materia Medica** (1901) — ~700 remedies, public domain
- Potentially: Kent's Repertory, Clarke's Dictionary

## Structure

```
homeo-magic/
├── data/
│   ├── remedies/           # One JSON file per remedy
│   ├── symptoms.json       # Inverted index: symptom → remedies
│   └── body_systems.json   # Taxonomy of body systems
├── scraper/
│   └── boericke.py         # Scraper for materiamedica.info
├── web/                    # Optional: simple lookup UI
└── README.md
```

## Status

🚧 Just started

---

## Appendix: Origin

This project was created to help a homeopathy practitioner quickly look up symptoms and find relevant remedies from classical texts.

### Original Prompt

> What are the online free resources for homeopathy practitioners — in particular, things that relate symptoms to fixes

> Take a look at a few of the free books. Can you extract symptoms and relate them to treatments?

> Make a new repo in work, call it Homeo-Magic.
