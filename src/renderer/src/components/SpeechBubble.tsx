import React from 'react';

interface SpeechBubbleProps {
  state: string;
  skipsCount: number;
  workDuration: number;
  tip: string;
  children?: React.ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  customDialogue?: string | null;
  onMouseDown?: (e: React.MouseEvent) => void;
}

export const SpeechBubble: React.FC<SpeechBubbleProps> = ({
  state,
  skipsCount,
  workDuration,
  tip,
  children,
  onMouseEnter,
  onMouseLeave,
  customDialogue = null,
  onMouseDown,
}) => {
  const getDialogueText = () => {
    if (customDialogue) return customDialogue;
    switch (state) {
      case 'BREAK':
        return `Break Time!\n${tip}`;
      
      case 'POPUP':
        if (skipsCount >= 3) {
          return "I'm getting worried :(\nPlease consider taking a short break now...";
        }
        return `Hey Harshit!\nYou've been focused for ${workDuration} minutes.\nTake a ${5} minute break?`;

      case 'IDLE':
        return "Zzz... Oh, are you stepping away? Take your time!";

      case 'SNOOZE':
        return "Alright, I'll check back in a bit! Happy coding.";

      default:
        return "Keep going! You're doing great.";
    }
  };

  return (
    <div 
      className="speech-bubble non-draggable"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={onMouseDown}
    >
      <div className="speech-text">{getDialogueText()}</div>
      {children}
      {/* Decorative cloud/thinking bubble tail circles */}
      <div className="thinking-tail">
        <div className="tail-circle tail-3" />
        <div className="tail-circle tail-2" />
        <div className="tail-circle tail-1" />
      </div>
    </div>
  );
};
