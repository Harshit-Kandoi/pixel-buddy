import { describe, expect, it } from 'vitest';
import { NOTES_KEPT, NOTE_MAX_LENGTH, SYNC_MAX_BYTES, addNote, fitForSync, markSeen, mergeNotes, notesAsText, pendingNote, removeNote, visibleNotes } from '../../utils/notes';

describe('break notes', () => {
  it('keeps one tidy line, newest first, and ignores empty notes', () => {
    let notes = addNote([], '  fixing   the\nlogin bug ', 1000);
    notes = addNote(notes, 'reply to Priya', 2000);
    expect(notes.map((n) => n.text)).toEqual(['reply to Priya', 'fixing the login bug']);
    expect(addNote(notes, '   ', 3000)).toBe(notes);
    expect(addNote([], 'x'.repeat(500))[0].text).toHaveLength(NOTE_MAX_LENGTH);
  });

  it('shows the newest note after the break until it is dismissed', () => {
    const notes = addNote(addNote([], 'old', 1000), 'new', 2000);
    expect(pendingNote(notes)?.text).toBe('new');
    expect(notes[1].seen).toBe(true); // an older, never-shown note doesn't pop up later
    expect(pendingNote(markSeen(notes, notes[0].id))).toBeNull();
    expect(pendingNote([])).toBeNull();
    expect(visibleNotes(removeNote(notes, notes[0].id)).map((n) => n.text)).toEqual(['old']);
  });

  it(`keeps the last ${NOTES_KEPT}`, () => {
    let notes = addNote([], 'first', 0);
    for (let i = 1; i < 30; i++) notes = addNote(notes, `note ${i}`, i);
    expect(notes).toHaveLength(NOTES_KEPT);
    expect(notes[0].text).toBe('note 29');
  });

  it('merges notes from two computers, once each, seen if either saw it', () => {
    const here = addNote([], 'here', 1000);
    const there = addNote([], 'there', 2000);
    const merged = mergeNotes(here, [...there, { ...here[0], seen: true }, { bogus: true }]);
    expect(merged.map((n) => [n.text, !!n.seen])).toEqual([['there', false], ['here', true]]);
    expect(mergeNotes(undefined, 'garbage')).toEqual([]);
  });

  it('a note deleted on one computer stays deleted after syncing with another', () => {
    const both = addNote([], 'private thought', 1000);
    const deletedHere = removeNote(both, both[0].id);
    expect(deletedHere[0].text).toBe(''); // the words are gone, only the marker stays
    expect(visibleNotes(mergeNotes(deletedHere, both))).toEqual([]);
    expect(visibleNotes(mergeNotes(both, deletedHere))).toEqual([]);
    expect(pendingNote(deletedHere)).toBeNull();
  });

  it('fits notes into one Chrome sync item, even in scripts that take 3 bytes a letter', () => {
    let notes = addNote([], 'आ'.repeat(NOTE_MAX_LENGTH), 0);
    for (let i = 1; i < NOTES_KEPT; i++) notes = addNote(notes, 'आ'.repeat(NOTE_MAX_LENGTH), i);
    const synced = fitForSync(notes);
    expect(new TextEncoder().encode(JSON.stringify(synced)).length).toBeLessThanOrEqual(SYNC_MAX_BYTES);
    expect(synced.length).toBeGreaterThan(0);
    expect(synced[0]).toEqual(notes[0]);
  });

  it('exports as plain text', () => {
    const text = notesAsText(addNote([], 'fixing the login bug', Date.UTC(2026, 10, 12, 10, 0)), 'en-GB');
    expect(text).toMatch(/^Pixel Buddy · break notes\n\n.*12 Nov 2026.*fixing the login bug\n$/);
  });
});
