import { playChime, playWorriedBeep } from '../../src/utils/sounds';

// Plays reminder chimes for the service worker, which has no audio of its own.
chrome.runtime.onMessage.addListener((message: { type?: string; kind?: string }) => {
  if (message?.type !== 'play') return;
  if (message.kind === 'worried') playWorriedBeep(true);
  else playChime(true);
});
