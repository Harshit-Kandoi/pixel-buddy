// Break notes: one line you leave yourself before a break ("fixing the login bug, line 42"),
// shown when you come back. Kept in settings, newest first.

export interface BreakNote {
  id: string;
  text: string;
  /** When it was written (ms since epoch). */
  at: number;
  /** Shown after the break and dismissed. */
  seen?: boolean;
  /** Deleted: kept as an empty marker so Chrome sync doesn't bring it back from another computer. */
  deleted?: boolean;
}

/** The notes to show (deleted ones are only markers). */
export const visibleNotes = (notes: BreakNote[] | undefined): BreakNote[] => (notes ?? []).filter((n) => !n.deleted);

export const NOTE_MAX_LENGTH = 160;
export const NOTES_KEPT = 20;
// chrome.storage.sync allows 8 KB per item; stay under it with room for the key.
export const SYNC_MAX_BYTES = 7500;

export function addNote(notes: BreakNote[] | undefined, text: string, now = Date.now()): BreakNote[] {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX_LENGTH);
  if (!clean) return notes ?? [];
  const note: BreakNote = { id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, text: clean, at: now };
  // A new note replaces the reminder from an earlier break you never came back to.
  return [note, ...(notes ?? []).map((n) => (n.seen ? n : { ...n, seen: true }))].slice(0, NOTES_KEPT);
}

/** The note to show after a break: the newest one, if you haven't seen it yet. */
export function pendingNote(notes: BreakNote[] | undefined): BreakNote | null {
  const latest = visibleNotes(notes)[0];
  return latest && !latest.seen ? latest : null;
}

export const markSeen = (notes: BreakNote[] | undefined, id: string): BreakNote[] =>
  (notes ?? []).map((n) => (n.id === id ? { ...n, seen: true } : n));

export const removeNote = (notes: BreakNote[] | undefined, id: string): BreakNote[] =>
  (notes ?? []).map((n) => (n.id === id ? { id: n.id, text: '', at: n.at, seen: true, deleted: true } : n));

const isNote = (n: unknown): n is BreakNote => {
  const note = n as BreakNote | null;
  return !!note && typeof note.id === 'string' && typeof note.text === 'string' && Number.isFinite(note.at);
};

/** Notes from two copies (this computer and Chrome sync): every note once, seen if either saw it. */
export function mergeNotes(a: unknown, b: unknown): BreakNote[] {
  const byId = new Map<string, BreakNote>();
  for (const note of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].filter(isNote)) {
    const known = byId.get(note.id);
    if (!known) byId.set(note.id, note);
    else if (known.deleted || note.deleted) byId.set(note.id, { id: note.id, text: '', at: note.at, seen: true, deleted: true });
    else byId.set(note.id, { ...known, seen: known.seen || note.seen });
  }
  return [...byId.values()].sort((x, y) => y.at - x.at).slice(0, NOTES_KEPT);
}

/** As many of the newest notes as fit in one chrome.storage.sync item. */
export function fitForSync(notes: BreakNote[]): BreakNote[] {
  const kept = [...notes];
  while (kept.length && new TextEncoder().encode(JSON.stringify(kept)).length > SYNC_MAX_BYTES) kept.pop();
  return kept;
}

export function notesAsText(notes: BreakNote[], locale?: string): string {
  const when = (at: number): string =>
    new Date(at).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  return ['Pixel Buddy · break notes', '', ...visibleNotes(notes).map((n) => `${when(n.at)}  ${n.text}`), ''].join('\n');
}
