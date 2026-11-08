import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain JavaScript module run by Node in the release workflow
import { changeNotes, highest, nextVersion } from './next-version.mjs';

describe('release versions', () => {
  it('releases a patch by default', () => {
    expect(nextVersion({ current: '1.2.0', commits: ['Fix the water count', 'new ideas'] })).toBe('1.2.1');
  });

  it('releases a minor for features', () => {
    expect(nextVersion({ current: '1.2.3', commits: ['fix: typo', 'feat: festival buddies'] })).toBe('1.3.0');
    expect(nextVersion({ current: '1.2.3', commits: ['feat(extension): share card'] })).toBe('1.3.0');
    expect(nextVersion({ current: '1.2.3', commits: ['Add JPEG avatars [minor]'] })).toBe('1.3.0');
  });

  it('can be forced', () => {
    expect(nextVersion({ current: '1.2.3', commits: ['feat: x'], bump: 'patch' })).toBe('1.2.4');
    expect(nextVersion({ current: '1.2.3', commits: [], bump: 'minor' })).toBe('1.3.0');
  });

  it('stays in the v1 series and ignores its own release commits', () => {
    expect(nextVersion({ current: '1.9.9', commits: ['feat: big change'] })).toBe('1.10.0');
    expect(nextVersion({ current: '1.2.0', commits: ['chore(release): v1.2.0 [skip release]'] })).toBe('1.2.1');
  });

  it('starts from the highest of the tag, app, and extension versions', () => {
    expect(highest(['v1.0.4', '1.0.4', '1.1.0'])).toBe('1.1.0');
    expect(highest(['v1.10.0', '1.9.0', undefined])).toBe('v1.10.0');
  });

  it('writes release notes from commits', () => {
    expect(changeNotes(['feat: festival buddies [minor]', 'chore(release): v1.2.0', 'Fix tooltip'])).toBe(
      "## What's new\n\n- feat: festival buddies\n- Fix tooltip\n",
    );
    expect(changeNotes([])).toBe('');
  });
});
