import classic from './assets/buddy.svg';
import newyear from './assets/buddy-newyear.svg';
import sankranti from './assets/buddy-sankranti.svg';
import lunarnewyear from './assets/buddy-lunarnewyear.svg';
import eid from './assets/buddy-eid.svg';
import holi from './assets/buddy-holi.svg';
import onam from './assets/buddy-onam.svg';
import halloween from './assets/buddy-halloween.svg';
import diwali from './assets/buddy-diwali.svg';
import christmas from './assets/buddy-christmas.svg';
import newyearRaw from './assets/buddy-newyear.svg?raw';
import sankrantiRaw from './assets/buddy-sankranti.svg?raw';
import lunarnewyearRaw from './assets/buddy-lunarnewyear.svg?raw';
import eidRaw from './assets/buddy-eid.svg?raw';
import holiRaw from './assets/buddy-holi.svg?raw';
import onamRaw from './assets/buddy-onam.svg?raw';
import halloweenRaw from './assets/buddy-halloween.svg?raw';
import diwaliRaw from './assets/buddy-diwali.svg?raw';
import christmasRaw from './assets/buddy-christmas.svg?raw';
import { FESTIVALS, type AvatarSkin, type FestivalSkin } from '../../utils/seasons';

const FESTIVAL_ART: Record<FestivalSkin, string> = { newyear, sankranti, lunarnewyear, eid, holi, onam, halloween, diwali, christmas };

// The classic buddy first, then one character per festival in calendar order.
export const AVATAR_SKINS: { id: AvatarSkin; label: string; title: string; src: string }[] = [
  { id: 'classic', label: 'Pixel Buddy', title: 'The classic Pixel Buddy', src: classic },
  ...FESTIVALS.map(f => ({ id: f.skin, label: f.name, title: `${f.name} buddy ${f.emoji}`, src: FESTIVAL_ART[f.skin] })),
];

// Still versions of the festival outfits (flame, twinkles and confetti held in place), shown
// while the buddy rests: an animated SVG is redrawn every frame, which costs real battery.
const still = (svg: string): string =>
  `data:image/svg+xml,${encodeURIComponent(svg.replace('</svg>', '<style>*{animation:none!important}</style></svg>'))}`;
const FESTIVAL_STILL: Record<FestivalSkin, string> = {
  newyear: still(newyearRaw), sankranti: still(sankrantiRaw), lunarnewyear: still(lunarnewyearRaw), eid: still(eidRaw),
  holi: still(holiRaw), onam: still(onamRaw), halloween: still(halloweenRaw), diwali: still(diwaliRaw), christmas: still(christmasRaw),
};

/** The avatar image; `resting` gives the still version (the classic buddy has no animation). */
export const avatarSrc = (skin: AvatarSkin, resting = false): string =>
  resting && skin !== 'classic' ? FESTIVAL_STILL[skin] : AVATAR_SKINS.find(s => s.id === skin)?.src ?? classic;
