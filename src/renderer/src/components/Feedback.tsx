import React, { useState } from 'react';
import { AppSettings } from '../../../utils/types';
import {
  FEEDBACK_EMAIL_MAX,
  FEEDBACK_IMPROVE,
  FEEDBACK_LIKES,
  FEEDBACK_MESSAGE_MAX,
  HAPPY_RATING,
  REVIEW_IS_STORE,
  REVIEW_URL,
  feedbackPageUrl,
  sendFeedback,
} from '../../../utils/feedback';
import { GITHUB_URL } from '../../../utils/links';

interface FeedbackProps {
  settings: AppSettings;
  onSave: (patch: Partial<AppSettings>) => void;
  /** Stars already picked (e.g. from the buddy's "How am I doing?"). */
  initialRating?: number;
}

const STAR_WORDS = ['', 'Not for me', 'Needs work', "It's okay", 'I like it', 'I love it'];

// Stars first; then what you like, what could be better and a note, sent to the developer. Happy
// raters see the public review button first, everyone can send a note and everyone can review:
// nobody is steered away from the store.
export const Feedback: React.FC<FeedbackProps> = ({ settings, onSave, initialRating = 0 }) => {
  const [rating, setRating] = useState(initialRating);
  const [hover, setHover] = useState(0);
  const [liked, setLiked] = useState<string[]>([]);
  const [improve, setImprove] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const happy = rating >= HAPPY_RATING;
  const reviewLabel = REVIEW_IS_STORE ? 'Rate on the Chrome Web Store ⭐' : 'Star on GitHub ⭐';

  const pick = (stars: number): void => {
    setRating(stars);
    if (status !== 'sending') setStatus('idle');
    onSave({ feedbackRating: stars });
  };
  const toggle = (list: string[], set: (next: string[]) => void, option: string): void =>
    set(list.includes(option) ? list.filter((o) => o !== option) : [...list, option]);

  const openReview = (): void => {
    window.open(REVIEW_URL, '_blank', 'noopener');
    onSave({ reviewAskAt: -1 });
  };

  const send = async (): Promise<void> => {
    setStatus('sending');
    const ok = await sendFeedback({ rating, liked, improve, message, email });
    setStatus(ok ? 'sent' : 'failed');
    if (ok) {
      onSave({ feedbackSentAt: Date.now(), reviewAskAt: -1 });
      setLiked([]);
      setImprove([]);
      setMessage('');
    }
  };

  const shown = hover || rating;

  return (
    <div className="dashboard-stats-card feedback-card" id="feedback">
      <div className="stat-card-title">💬 Feedback</div>
      <p className="feedback-question">
        {settings.feedbackSentAt && !rating ? 'Thanks for your feedback! Anything new to tell me?' : "How's Pixel Buddy for you?"}
      </p>
      <div className="feedback-stars" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((stars) => (
          <button
            key={stars}
            type="button"
            role="radio"
            aria-checked={rating === stars}
            aria-label={`${stars} star${stars === 1 ? '' : 's'}: ${STAR_WORDS[stars]}`}
            className={`feedback-star non-draggable ${stars <= shown ? 'filled' : ''}`}
            onMouseEnter={() => setHover(stars)}
            onFocus={() => setHover(stars)}
            onBlur={() => setHover(0)}
            onClick={() => pick(stars)}
          >
            ★
          </button>
        ))}
        <span className="feedback-star-word">{STAR_WORDS[shown]}</span>
      </div>

      {rating > 0 && status === 'sent' && (
        <div className="feedback-thanks" role="status">
          <p><strong>Thank you!</strong> It went straight to the developer, and every note gets read. 💚</p>
          {happy && (
            <button type="button" className="btn btn-primary btn-sm non-draggable" onClick={openReview}>{reviewLabel}</button>
          )}
          <button type="button" className="feedback-link non-draggable" onClick={() => setStatus('idle')}>Send something else</button>
        </div>
      )}

      {rating > 0 && status !== 'sent' && (
        <div className="feedback-form">
          {happy && (
            <div className="feedback-review">
              <p>Yay, glad you like it! {REVIEW_IS_STORE ? 'A short review on the Chrome Web Store' : 'A star on GitHub'} helps other people find the buddy.</p>
              <button type="button" className="btn btn-primary btn-sm non-draggable" onClick={openReview}>{reviewLabel}</button>
            </div>
          )}

          <p className="feedback-label">{happy ? 'What do you like most?' : 'What do you like?'}</p>
          <div className="feedback-chips">
            {FEEDBACK_LIKES.map((option) => (
              <button key={option} type="button" aria-pressed={liked.includes(option)} className={`feedback-chip non-draggable ${liked.includes(option) ? 'on' : ''}`} onClick={() => toggle(liked, setLiked, option)}>
                {option}
              </button>
            ))}
          </div>

          <p className="feedback-label">What could be better?</p>
          <div className="feedback-chips">
            {FEEDBACK_IMPROVE.map((option) => (
              <button key={option} type="button" aria-pressed={improve.includes(option)} className={`feedback-chip bad non-draggable ${improve.includes(option) ? 'on' : ''}`} onClick={() => toggle(improve, setImprove, option)}>
                {option}
              </button>
            ))}
          </div>

          <textarea
            className="feedback-text non-draggable"
            aria-label="Your feedback"
            maxLength={FEEDBACK_MESSAGE_MAX}
            rows={3}
            placeholder={happy ? 'Ideas or wishes? (optional)' : 'What went wrong, or what would make it better?'}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <input
            type="email"
            className="setting-text-input feedback-email non-draggable"
            aria-label="Email for a reply (optional)"
            maxLength={FEEDBACK_EMAIL_MAX}
            placeholder="Email, only if you'd like a reply (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="button"
            className={`btn ${happy ? 'btn-secondary' : 'btn-primary'} btn-sm feedback-send non-draggable`}
            disabled={status === 'sending'}
            onClick={() => void send()}
          >
            {status === 'sending' ? 'Sending…' : 'Send to the developer'}
          </button>
          {status === 'failed' && (
            <p className="feedback-error" role="alert">
              Couldn&apos;t send it from here.{' '}
              <button type="button" className="feedback-link non-draggable" onClick={() => window.open(feedbackPageUrl(rating), '_blank', 'noopener')}>
                Send it from the website
              </button>
            </p>
          )}
          <p className="feedback-privacy">
            Sends your stars, what you picked or wrote, and the app version. Nothing else.
            {!happy && (
              <>
                {' '}Prefer to say it in public?{' '}
                <button
                  type="button"
                  className="feedback-link non-draggable"
                  onClick={REVIEW_IS_STORE ? openReview : () => window.open(`${GITHUB_URL}/issues/new`, '_blank', 'noopener')}
                >
                  {REVIEW_IS_STORE ? 'Write a review' : 'Open an issue on GitHub'}
                </button>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
};
