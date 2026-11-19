import type { Config } from "tailwindcss";

/*
 * Accent: deep teal #0e7490 (hover #155e75). Deliberate choice: a data-infrastructure /
 * terminal character that sits outside the indigo/violet "AI default" band and is not the
 * cream + serif + sage swap. Used for links and the single primary button only; everything
 * else is ink on a near-white ground.
 */
export default {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: "#0e7490", hover: "#155e75" },
        ink: { DEFAULT: "#18181b", soft: "#52525b", faint: "#71717a" },
        line: "#e4e4e7",
        ground: "#fafafa",
        pos: "#15803d",
        neg: "#b91c1c",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
      },
      borderRadius: { btn: "8px", card: "10px", input: "8px" },
    },
  },
} satisfies Config;
