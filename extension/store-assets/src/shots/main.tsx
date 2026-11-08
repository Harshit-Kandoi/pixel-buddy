// Sets up one store screenshot scene with the real app UI and the preview's real scheduler.
import './clock'; // first: the scenes happen on 8 Nov 2026, during Diwali
import '../../../../preview/api';
import '../../../../src/renderer/src/index.css';
import './shots.css';
import { createRoot } from 'react-dom/client';
import App from '../../../../src/renderer/src/App';
import { preview } from '../../../../preview/api';
import { drawShareCard } from '../../../../src/renderer/src/shareCard';
import type { AppSettings } from '../../../../src/utils/types';
import { avatarSrc } from '../../../../src/renderer/src/avatars';
import { CLAIM_BREAKS, upcomingFestivals } from '../../../../src/utils/seasons';

const SCENES: Record<string, { title: string; text: string }> = {
  guided: { title: 'Breaks you actually take 🙆', text: 'Your buddy leads a short stretch, an eye refresh or a breathing break, and does it with you.' },
  festive: { title: 'Limited-time festival buddies 🎁', text: 'Take 3 breaks during a festival to keep its buddy. Miss it and it’s gone till next year.' },
  reminder: { title: 'Gentle break reminders', text: 'Pomodoro, Balanced, Deep focus or your own timings. Take a break, snooze or skip.' },
  share: { title: 'Share your little wins 📸', text: "Turn today's focus time, breaks and water into a picture for LinkedIn or friends." },
  water: { title: 'Water reminders, private by design 💧', text: 'A daily water goal. No account, no tracking: everything stays in your browser.' },
};

const scene = new URLSearchParams(location.search).get('scene') ?? 'guided';
document.documentElement.classList.add(`scene-${scene}`);
document.getElementById('caption-title')!.textContent = SCENES[scene].title;
document.getElementById('caption-text')!.textContent = SCENES[scene].text;

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
const base: Partial<AppSettings> = {
  userName: 'Sam', avatarSkin: scene === 'festive' ? 'auto' : 'classic', sound: false, reviewAskAt: -1,
  // The festive scene shows the claim moment: enough Diwali breaks taken, not claimed yet.
  festivalBreaks: scene === 'festive' ? { 'diwali-2026-11': CLAIM_BREAKS } : {}, claimedSkins: [],
  statsFocusMinutesToday: 145, statsBreaksCompletedToday: 3, hydrationDrankToday: 5, hydrationGoal: 8,
};

async function setUp(): Promise<void> {
  await window.api.saveSettings(base);
  const app = createRoot(document.getElementById('root')!);
  app.render(<App initialShowSettings={scene === 'share'} />);
  await wait(300);

  if (scene === 'guided') {
    // With three breaks done, this break gets the stretch routine; 47 s in is the chest-opener step.
    preview.breakAt(47);
  } else if (scene === 'festive') {
    // A teaser of what's next: this festival's buddy, then silhouettes until each one arrives.
    const shortDay = (d: Date): string => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const figures = [
      `<figure><img src="${avatarSrc('diwali')}" alt="">Diwali<small>Now · until 11 Nov</small></figure>`,
      ...upcomingFestivals(new Date(), 4).map(u => `<figure class="mystery"><img src="${avatarSrc(u.festival.skin)}" alt="">${u.festival.name}<small>${shortDay(u.day)}</small></figure>`),
    ];
    const lineup = Object.assign(document.createElement('div'), { className: 'lineup' });
    lineup.innerHTML = `<b>Collect them before they're gone</b><div class="lineup-row">${figures.join('')}</div>`;
    document.querySelector('.page')!.appendChild(lineup);
    preview.focus();
  } else if (scene === 'reminder') {
    preview.reminder();
  } else if (scene === 'water') {
    preview.water();
  } else if (scene === 'share') {
    const settings = await window.api.getSettings();
    const blob = await drawShareCard(settings, 'classic', new Date(2026, 10, 12));
    (document.getElementById('share-card') as HTMLImageElement).src = URL.createObjectURL(blob);
    await wait(200);
    document.querySelectorAll<HTMLButtonElement>('.settings-tab-btn')[1]?.click();
  }

  await wait(1800); // entry animations finish
  document.documentElement.classList.add('freeze');
  document.title = 'ready';
}

void setUp();
