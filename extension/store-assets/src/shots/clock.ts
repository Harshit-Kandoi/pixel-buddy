// Store screenshots show the app on a fixed day (8 Nov 2026, during Diwali) so the festival
// scene always renders the same, while time keeps moving for timers and animations.
// Imported first by main.tsx, before the app reads the date.
const RealDate = Date;
const offset = new RealDate(2026, 10, 8, 11, 0).getTime() - RealDate.now();

class ShotDate extends RealDate {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forwards Date's overloads
  constructor(...args: any[]) {
    if (args.length === 0) super(RealDate.now() + offset);
    else super(...(args as [number]));
  }

  static now(): number {
    return RealDate.now() + offset;
  }
}

globalThis.Date = ShotDate as DateConstructor;
