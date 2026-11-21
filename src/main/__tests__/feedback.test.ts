import { describe, expect, it } from 'vitest';
import { FEEDBACK_MESSAGE_MAX, feedbackForm, feedbackPlatform } from '../../utils/feedback';

describe('feedback form', () => {
  const base = { rating: 4, liked: ['The buddy', 'Water reminders'], improve: ['Battery or heat'], message: '  More festivals please  ', email: '' };

  it('builds the fields the website form expects', () => {
    const form = feedbackForm(base, 'chrome-extension', '1.2.0');
    expect(Object.fromEntries(form)).toEqual({
      'form-name': 'feedback',
      rating: '4',
      liked: 'The buddy, Water reminders',
      improve: 'Battery or heat',
      message: 'More festivals please',
      email: '',
      platform: 'chrome-extension',
      version: '1.2.0',
      company: '',
    });
  });

  it('keeps the rating between 1 and 5 and drops unknown options', () => {
    const form = feedbackForm({ ...base, rating: 9, liked: ['The buddy', 'Free pizza'], improve: ['<script>'] }, 'mac', '1.2.0');
    expect(form.get('rating')).toBe('5');
    expect(form.get('liked')).toBe('The buddy');
    expect(form.get('improve')).toBe('');
    expect(feedbackForm({ ...base, rating: 0 }, 'mac', '1').get('rating')).toBe('1');
  });

  it('caps the note', () => {
    const form = feedbackForm({ ...base, message: 'x'.repeat(FEEDBACK_MESSAGE_MAX + 50) }, 'windows', '1.2.0');
    expect(form.get('message')).toHaveLength(FEEDBACK_MESSAGE_MAX);
  });

  it('names the platform', () => {
    expect(feedbackPlatform('Mozilla/5.0 (Macintosh) Chrome/131', true)).toBe('chrome-extension');
    expect(feedbackPlatform('Mozilla/5.0 (Windows NT 10.0) Chrome/131 Edg/131', true)).toBe('edge-extension');
    expect(feedbackPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Electron/39', false)).toBe('mac');
    expect(feedbackPlatform('Mozilla/5.0 (Windows NT 10.0; Win64) Electron/39', false)).toBe('windows');
    expect(feedbackPlatform('Mozilla/5.0 (X11; Linux x86_64) Electron/39', false)).toBe('linux');
  });
});
