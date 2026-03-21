"use client";

import { useState, useEffect } from "react";
import type { ProfilesData, SymptomIndexData, MateriaProfile } from "./types";

let cachedProfiles: ProfilesData | null = null;
let cachedSymptomIndex: SymptomIndexData | null = null;
let cachedArchiveLinks: Record<string, { leaf: number; url: string }> | null = null;

/** Reset the module-level cache (for testing) */
export function resetMateriaCache() {
  cachedProfiles = null;
  cachedSymptomIndex = null;
  cachedArchiveLinks = null;
}

async function loadMateriaData(): Promise<{
  profiles: ProfilesData | null;
  symptomIndex: SymptomIndexData | null;
  archiveLinks: Record<string, { leaf: number; url: string }> | null;
}> {
  if (cachedProfiles && cachedSymptomIndex) {
    return { profiles: cachedProfiles, symptomIndex: cachedSymptomIndex, archiveLinks: cachedArchiveLinks };
  }
  try {
    const [profilesRes, indexRes, linksRes] = await Promise.all([
      fetch("/data/kent/profiles.json"),
      fetch("/data/kent/symptom_index.json"),
      fetch("/data/kent/archive_links.json"),
    ]);
    if (!profilesRes.ok || !indexRes.ok) throw new Error("Failed to load");
    const profiles = (await profilesRes.json()) as ProfilesData;
    const symptomIndex = (await indexRes.json()) as SymptomIndexData;
    const archiveLinks = linksRes.ok ? await linksRes.json() : null;
    cachedProfiles = profiles;
    cachedSymptomIndex = symptomIndex;
    cachedArchiveLinks = archiveLinks;
    return { profiles, symptomIndex, archiveLinks };
  } catch {
    return { profiles: null, symptomIndex: null, archiveLinks: null };
  }
}

export function MateriaPanel({
  remedyAbbrev,
  selectedSymptoms,
}: {
  remedyAbbrev: string;
  selectedSymptoms: string[];
}) {
  const [profile, setProfile] = useState<MateriaProfile | null>(null);
  const [passages, setPassages] = useState<Record<string, string> | null>(null);
  const [archiveUrl, setArchiveUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    loadMateriaData().then(({ profiles, symptomIndex, archiveLinks }) => {
      if (cancelled) return;
      if (!profiles || !profiles[remedyAbbrev]) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setProfile(profiles[remedyAbbrev]);
      setPassages(symptomIndex?.[remedyAbbrev] ?? {});
      // Find archive link by matching remedy name
      if (archiveLinks && profiles[remedyAbbrev]) {
        const remedyName = profiles[remedyAbbrev].remedy;
        if (archiveLinks[remedyName]) {
          setArchiveUrl(archiveLinks[remedyName].url);
        }
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [remedyAbbrev]);

  if (loading) {
    return (
      <div className="py-6 text-center text-[#6b7280] text-sm">
        Loading materia medica...
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="py-6 text-center text-[#6b7280] text-sm italic">
        No materia medica data available for this remedy.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 1. Symptom Cross-References */}
      {selectedSymptoms.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-[#065774] uppercase tracking-wide mb-3 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            Symptom Cross-References
          </h3>
          <div className="space-y-3">
            {selectedSymptoms.map((sym) => {
              // Try exact match first, then fuzzy match on symptom path parts
              let passage = passages?.[sym];
              if (!passage && passages) {
                // Try matching on key parts of the symptom path
                const symParts = sym.toLowerCase().split(",").map(s => s.trim());
                for (const [key, val] of Object.entries(passages)) {
                  const keyParts = key.toLowerCase().split(",").map(s => s.trim());
                  // Match if all parts of the shorter path are in the longer one
                  const shorter = symParts.length <= keyParts.length ? symParts : keyParts;
                  const longer = symParts.length <= keyParts.length ? keyParts : symParts;
                  if (shorter.every(p => longer.some(lp => lp.includes(p) || p.includes(lp)))) {
                    passage = val;
                    break;
                  }
                }
              }
              return (
                <div
                  key={sym}
                  className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-3"
                >
                  <div className="font-semibold text-[#1f2937] text-sm mb-1">
                    {sym}
                  </div>
                  {passage ? (
                    <p className="text-[13px] text-[#374151] leading-relaxed italic">
                      &ldquo;{passage}&rdquo;
                    </p>
                  ) : (
                    <p className="text-[13px] text-[#9ca3af] italic">
                      No specific passage found.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 2. Constitutional Profile */}
      <section>
        <h3 className="text-sm font-semibold text-[#065774] uppercase tracking-wide mb-3 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Constitutional Profile
        </h3>
        <div className="space-y-3">
          <ProfileField label="Personality" text={profile.personality} />
          <ProfileField label="Mental State" text={profile.mental_state} />
          <ProfileField
            label="Emotional Pattern"
            text={profile.emotional_pattern}
          />
        </div>
      </section>

      {/* 3. Book Link */}
      <section>
        <h3 className="text-sm font-semibold text-[#065774] uppercase tracking-wide mb-3 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          Full Book Text
        </h3>
        <div className="flex flex-wrap gap-3">
          <a
            href={`/data/kent/remedy_markdown/${profile.file}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#065774] text-white rounded-lg text-sm font-medium hover:bg-[#042B58] transition-colors no-underline"
          >
            Read full Kent lecture: {profile.remedy}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
          {archiveUrl && (
            <a
              href={archiveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#8B4513] text-white rounded-lg text-sm font-medium hover:bg-[#6B3410] transition-colors no-underline"
            >
              View original in Internet Archive
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          )}
        </div>
      </section>
    </div>
  );
}

function ProfileField({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-3">
      <div className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-1">
        {label}
      </div>
      <p className="text-[13px] text-[#374151] leading-relaxed m-0">{text}</p>
    </div>
  );
}
