/**
 * Tailwind v3 config for the precompiled /tw.css that replaces the Tailwind Play
 * CDN on the three landing pages (index/homeowners/auto). The dashboard still
 * uses the CDN by design (internal, not paid-traffic). Regenerate after changing
 * any classes in the pages: `bash tools/build-css.sh` (see that script).
 *
 * Mirrors the old inline `tailwind.config` (sf palette + Inter sans). The
 * safelist guarantees classes that only ever appear in JS strings (dynamically
 * toggled error/focus rings, the spinner, language-toggle styling) survive
 * purge — most are also found by content-scanning the inline <script>, but the
 * safelist is the belt-and-suspenders for a live ad funnel.
 */
module.exports = {
  content: ['./index.html', './homeowners.html', './auto.html'],
  theme: {
    extend: {
      colors: {
        sf: {
          red: '#E22925',
          redDark: '#B81E1B',
          ink: '#111111',
          gray: '#6B7280',
          cream: '#FDFBF7',
        },
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui'] },
    },
  },
  safelist: [
    'border-sf-red', 'ring-2', 'ring-sf-red/20', 'ring-sf-red/30',
    'text-sf-red', 'text-sf-ink',
    'text-sf-ink/45', 'text-sf-ink/55', 'text-sf-ink/65', 'text-sf-ink/70', 'text-sf-ink/75', 'text-sf-ink/85',
    'hidden', 'block', 'inline-block', 'flex', 'inline-flex',
    'underline', 'font-semibold', 'font-bold',
    'bg-sf-red', 'bg-sf-redDark', 'hover:bg-sf-redDark', 'active:bg-sf-redDark', 'bg-sf-red/10',
    'animate-spin', 'border-white/40', 'border-t-white',
  ],
};
