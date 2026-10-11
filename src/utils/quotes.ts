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

// Lines the buddy says when clicked. Kept short so they fit the bubble in two or three lines.
export const BUDDY_LINES = [
  // Encouragement
  "You're doing great. Seriously, keep going! 🚀",
  "Small steps still move you forward. ✨",
  "Progress over perfection, always.",
  "Look at you, getting things done!",
  "Proud of you for showing up today. 🌱",
  "One task at a time. You've got this.",
  "Hard part? You'll crack it. You always do.",
  "Future you is going to be so grateful.",
  // Posture & body
  "Quick check: shoulders down, jaw unclenched. 🙂",
  "Sit tall! No shrimp posture allowed. 🦐",
  "Roll your shoulders back a couple of times. Ahh, better.",
  "Feet flat, back straight. Perfect.",
  "Wiggle your fingers. They work hard too!",
  // Eyes & breathing
  "Look at something far away for 20 seconds. 👀",
  "Blink a few times. Your eyes will thank you.",
  "Deep breath in... and slowly out. Nice.",
  "Unfocus your eyes for a moment. Rest them.",
  // Water & snacks
  "Have you had some water lately? 💧",
  "Coffee is great. Water is great-er. 💧",
  "A sip of water now, a clearer head later.",
  "Snack idea: something crunchy and green. 🥕",
  // Coding & work humour
  "A bug? We'll squash it together. 🐛",
  "It works on my machine. And I'm on your machine! 💻",
  "Have you tried turning it off and on again?",
  "Commit early, commit often, take breaks always.",
  "Rubber duck mode: explain it to me, I'm listening. 🦆",
  "Fun fact: I run entirely on good vibes. ⚡",
  "Tabs or spaces? I just want you to stretch.",
  // Friendly nudges
  "Stand up and stretch? I'll keep your seat warm.",
  "A short walk can untangle a long problem.",
  "Remember to smile. It's free! 😊",
  "You deserve a little break soon. ☕",
  "Boop! That tickles. 😄",
  "Hi! I was just thinking about you.",
  "I'm right here if you need me. 💚",
];

const TIME_LINES: { from: number; to: number; lines: string[] }[] = [
  { from: 5, to: 12, lines: ["Good morning! Let's make today a good one. ☀️", "Morning! Water before coffee? 💧"] },
  { from: 12, to: 14, lines: ["Lunch time soon? Step away from the screen to eat. 🥪", "Afternoon slump? A quick walk helps."] },
  { from: 14, to: 18, lines: ["Afternoon push! You're almost there.", "Golden hour for focus. Let's go. ✨"] },
  { from: 18, to: 22, lines: ["Evening already? Don't forget to wind down. 🌙", "Great work today. Rest is part of the job too."] },
  { from: 22, to: 29, lines: ["It's getting late... sleep fixes most bugs. 😴", "Late night coding? Lots of water and a short stop, okay?"] },
];

let lastLine = '';

// Random clicked line, sometimes picked to suit the time of day, never the same twice in a row.
export function getRandomBuddyLine(now: Date = new Date()): string {
  const hour = now.getHours() < 5 ? now.getHours() + 24 : now.getHours();
  const timed = TIME_LINES.find((t) => hour >= t.from && hour < t.to)?.lines ?? [];
  const pool = Math.random() < 0.25 && timed.length ? timed : BUDDY_LINES;
  let line = pool[Math.floor(Math.random() * pool.length)];
  if (line === lastLine && pool.length > 1) {
    line = pool[(pool.indexOf(line) + 1) % pool.length];
  }
  lastLine = line;
  return line;
}
