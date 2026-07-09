import React from 'react';

interface SpeechBubbleProps {
  state: string;
  skipsCount: number;
  workDuration: number;
  tip: string;
  children?: React.ReactNode;
  customDialogue?: string | null;
  onMouseDown?: (e: React.MouseEvent) => void;
  userName?: string | null;
}

export const SpeechBubble: React.FC<SpeechBubbleProps> = ({
  state,
  skipsCount,
  workDuration,
  tip,
  children,
  customDialogue = null,
  onMouseDown,
  userName = null,
}) => {
  const displayName = userName && userName.trim() ? userName.trim() : 'there';

  const getDialogueText = () => {
    if (customDialogue) return customDialogue;
    switch (state) {
      case 'BREAK':
        return `Break Time!\n${tip}`;
      
      case 'POPUP':
        if (skipsCount >= 3) {
          return "I'm getting worried :(\nPlease consider taking a short break now...";
        }
        return `Hey ${displayName}!\nYou've been focused for ${workDuration} minutes.\nTime for a quick break?`;

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
