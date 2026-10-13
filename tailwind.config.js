/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // Badge tones are picked at runtime (tone-${tone}), so keep them in the build.
  safelist: ["tone-good", "tone-warn", "tone-bad", "tone-same", "tone-acc"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), surface: v("surface"), surface2: v("surface-2"), ink: v("ink"), muted: v("muted"), line: v("line"),
        accent: v("accent"), "accent-ink": v("accent-ink"), "accent-soft": v("accent-soft"),
        warm: v("warm"), "warm-soft": v("warm-soft"),
        good: v("good"), "good-soft": v("good-soft"), bad: v("bad"), "bad-soft": v("bad-soft"),
        same: v("same"), "same-soft": v("same-soft"), me: v("me"),
        "wa-bar": v("wa-bar"), "wa-bg": v("wa-bg"), "wa-me": v("wa-me"), "wa-them": v("wa-them"), "wa-green": v("wa-green"),
        call: v("call-bg"),
      },
      fontFamily: {
        display: ['"Literata"', "Georgia", "serif"],
        body: ['"Atkinson Hyperlegible"', '"Segoe UI"', "system-ui", "sans-serif"],
      },
      boxShadow: { phone: "0 20px 50px -24px rgb(20 45 40 / 0.45)" },
      keyframes: {
        dot: { "0%,80%,100%": { opacity: "0.25" }, "40%": { opacity: "1" } },
        rise: { from: { transform: "translateY(6px)", opacity: "0.3" }, to: { transform: "none", opacity: "1" } },
        ring: { "0%": { boxShadow: "0 0 0 0 rgb(99 195 173 / 0.45)" }, "100%": { boxShadow: "0 0 0 22px rgb(99 195 173 / 0)" } },
      },
      animation: { dot: "dot 1s infinite", rise: "rise .25s ease-out", ring: "ring 1.2s ease-out infinite" },
    },
  },
  plugins: [],
};
