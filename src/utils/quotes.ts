import type { FestivalSkin } from './seasons';

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

// Said now and then while the buddy wears a festival outfit.
export const FESTIVE_LINES: Record<FestivalSkin, string[]> = {
  diwali: [
    "Happy Diwali! ✨ May your day glow and your bugs stay hidden.",
    "Shubh Deepavali! 🪔 Rest your eyes, the diyas are bright enough.",
    "Too many sweets? A short walk makes room for one more. 🍬",
    "Light a diya, take a breath, take a break. 🪔",
    "Diwali cleaning tip: close a few tabs. ✨",
    "Crackers outside, calm focus inside. You've got this. 🎆",
    "Save one kaju katli for me, okay? 🍬",
    "Wishing you light, laughter, and a lighter inbox. 🪔",
  ],
  christmas: [
    "Merry Christmas! 🎄 Cookies count as a break, right?",
    "Ho ho ho! Time to stretch those elf legs. 🎅",
    "Wrap up that task, then wrap some gifts. 🎁",
    "Hot cocoa and a short break? Perfect combo. ☕",
    "Even Santa rests after the big night. 🛷",
  ],
  newyear: [
    "Happy New Year! 🎉 New year, same you, more breaks.",
    "Resolution idea: more water, fewer tabs. 💧",
    "Here's to a year of kinder workdays. ✨",
    "Fresh calendar, fresh start. You've got this! 🗓️",
  ],
  sankranti: [
    "Happy Sankranti! 🪁 Go fly a kite, literally.",
    "Til-gul ghya, god god bola! 🍬",
    "Sun's out, kites up. Take a sunny break! ☀️",
    "Happy Lohri, and Pongalo Pongal! 🍚",
  ],
  lunarnewyear: [
    "Happy Lunar New Year! 🧧 Wishing you luck and lots of breaks.",
    "New moon, new year, fresh focus. 🏮",
    "A lucky red envelope of advice: drink some water. 🧧",
    "May your year be lucky and your bugs be few. ✨",
  ],
  eid: [
    "Eid Mubarak! 🌙 Wishing you peace and a calm day.",
    "Sweet sevaiyan and a slow break? Perfect. 🍮",
    "Take a moment, share a smile, rest a little. 🌙",
    "May your day be bright and your heart be light. ✨",
  ],
  onam: [
    "Happy Onam! 🌼 Time for a sadya-sized break.",
    "Onam ashamsakal! May your pookalam and your code both bloom. 🌸",
    "A big feast deserves a little walk afterwards. 🍌",
    "Maveli is visiting. Look your best: sit up straight! 👑",
  ],
  halloween: [
    "Happy Halloween! 🎃 The scariest thing here is your posture.",
    "Boo! Did that make you blink? Good, your eyes needed it. 👻",
    "Trick or treat? Treat yourself to a break. 🍬",
    "No ghosts here, just unanswered tabs. 🦇",
  ],
  holi: [
    "Happy Holi! 🎨 Let your break be colourful.",
    "Bura na mano, Holi hai! 💦",
    "Wash off the colours, keep the good vibes. 🌈",
    "A splash of water for you, and one for me! 💧",
  ],
};

const TIME_LINES: { from: number; to: number; lines: string[] }[] = [
  { from: 5, to: 12, lines: ["Good morning! Let's make today a good one. ☀️", "Morning! Water before coffee? 💧"] },
  { from: 12, to: 14, lines: ["Lunch time soon? Step away from the screen to eat. 🥪", "Afternoon slump? A quick walk helps."] },
  { from: 14, to: 18, lines: ["Afternoon push! You're almost there.", "Golden hour for focus. Let's go. ✨"] },
  { from: 18, to: 22, lines: ["Evening already? Don't forget to wind down. 🌙", "Great work today. Rest is part of the job too."] },
  { from: 22, to: 29, lines: ["It's getting late... sleep fixes most bugs. 😴", "Late night coding? Lots of water and a short stop, okay?"] },
];

let lastLine = '';

// Random clicked line, sometimes picked to suit the time of day, never the same twice in a row.
export function getRandomBuddyLine(now: Date = new Date(), festive: string[] = []): string {
  const hour = now.getHours() < 5 ? now.getHours() + 24 : now.getHours();
  const timed = TIME_LINES.find((t) => hour >= t.from && hour < t.to)?.lines ?? [];
  const roll = Math.random();
  let pool = BUDDY_LINES;
  if (festive.length && roll < 0.4) pool = festive;
  else if (timed.length && roll >= 0.75) pool = timed;
  let line = pool[Math.floor(Math.random() * pool.length)];
  if (line === lastLine && pool.length > 1) {
    line = pool[(pool.indexOf(line) + 1) % pool.length];
  }
  lastLine = line;
  return line;
}
