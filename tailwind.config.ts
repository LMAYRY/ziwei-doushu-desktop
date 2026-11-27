import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // 3.0 纸本设计系统：全部指向 globals.css 的 CSS 变量，亮色（纸）/ 暗色（夜读）自动切换
      colors: {
        paper: {
          DEFAULT: "var(--paper)",
          2: "var(--paper-2)",
          3: "var(--paper-3)",
        },
        ink: {
          1: "var(--ink-1)",
          2: "var(--ink-2)",
          3: "var(--ink-3)",
        },
        rule: {
          DEFAULT: "var(--rule)",
          strong: "var(--rule-strong)",
        },
        zhu: {
          DEFAULT: "var(--zhu)",
          deep: "var(--zhu-deep)",
          wash: "var(--zhu-wash)",
        },
        // 旧名字保留为别名
        bg: {
          0: "var(--paper)",
          1: "var(--paper-2)",
          2: "var(--paper-3)",
          inv: "var(--ink-1)",
        },
        tx: {
          0: "var(--ink-1)",
          1: "var(--ink-1)",
          2: "var(--ink-2)",
          3: "var(--ink-3)",
          inv: "var(--paper)",
        },
        ac: {
          DEFAULT: "var(--zhu)",
          dim: "var(--zhu-deep)",
        },
        // 四化语义色（仅命盘数据）
        lu:   "var(--lu)",
        quan: "var(--quan)",
        ke:   "var(--ke)",
        ji:   "var(--ji)",
      },
      fontFamily: {
        serif: ["var(--serif)"],
        sans: ["var(--sans)"],
        mono: ["var(--mono)"],
      },
      boxShadow: {
        xs: "none",
        sm: "none",
        md: "none",
        lg: "var(--sh-lg)",
      },
      borderRadius: {
        xs: "1px",
        sm: "2px",
        md: "2px",
        lg: "2px",
        xl: "2px",
        pill: "2px",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease both",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
