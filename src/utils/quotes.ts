export const BREAK_TIPS = [
  "Stretch your arms, shoulders, and back. Feel the tension release.",
  "Drink a glass of water to rehydrate and keep your mind sharp.",
  "Stand up, step away from your desk, and walk around for a couple of minutes.",
  "Look at an object at least 20 feet away for 20 seconds (the 20-20-20 rule).",
  "Close your eyes, breathe in deeply for 4 seconds, hold, and breathe out slowly.",
  "Blink rapidly 10 times to rehydrate and refresh your eyes.",
  "Roll your neck slowly from side to side to relieve muscle tension.",
  "Rest your hands and shake your wrists gently to relax your fingers.",
  "Do a quick standing calf stretch or reach for your toes.",
  "Look out the window and let your eyes adjust to natural light.",
];

export function getRandomTip(): string {
  const index = Math.floor(Math.random() * BREAK_TIPS.length);
  return BREAK_TIPS[index];
}
