import { playChime as chime, playWorriedBeep as worriedBeep } from '../../src/utils/sounds';

// Swapped in for the app's sounds module. Every open tab runs its own copy of the app, so
// reminder chimes come once from the service worker instead; here we only play sounds the
// user just triggered in this tab, like clicking the buddy.
const userTriggered = () => navigator.userActivation?.isActive ?? false;

export function playChime(enabled: boolean): void {
  if (userTriggered()) chime(enabled);
}

export function playWorriedBeep(enabled: boolean): void {
  if (userTriggered()) worriedBeep(enabled);
}
