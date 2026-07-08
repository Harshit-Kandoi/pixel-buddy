import React from 'react';

interface TimerProps {
  secondsLeft: number;
  subtext?: string;
}

export const Timer: React.FC<TimerProps> = ({ secondsLeft, subtext }) => {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="timer-container non-draggable">
      <div>{formattedTime}</div>
      {subtext && <div className="timer-subtext">{subtext}</div>}
    </div>
  );
};
