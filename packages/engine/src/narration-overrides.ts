/**
 * Hand-maintained corrections for Forteller narration cues, keyed by
 * `kind:ref` (e.g. `scenario-intro:1`, `section:12.3`, `event:summer-road:SR-05`).
 * Use when Forteller names a track differently than the generated search
 * text, or when a stable link to a track is known.
 */
export const narrationOverrides: Record<string, { title?: string; search?: string; url?: string }> = {};
