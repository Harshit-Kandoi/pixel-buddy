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
import { FESTIVALS, type AvatarSkin, type FestivalSkin } from '../../utils/seasons';

const FESTIVAL_ART: Record<FestivalSkin, string> = { newyear, sankranti, lunarnewyear, eid, holi, onam, halloween, diwali, christmas };

// The classic buddy first, then one character per festival in calendar order.
export const AVATAR_SKINS: { id: AvatarSkin; label: string; title: string; src: string }[] = [
  { id: 'classic', label: 'Pixel Buddy', title: 'The classic Pixel Buddy', src: classic },
  ...FESTIVALS.map(f => ({ id: f.skin, label: f.name, title: `${f.name} buddy ${f.emoji}`, src: FESTIVAL_ART[f.skin] })),
];

export const avatarSrc = (skin: AvatarSkin): string => AVATAR_SKINS.find(s => s.id === skin)?.src ?? classic;
