// Tailwind v4 entra por plugin do PostCSS — não existe mais `tailwind.config.js`
// nem `content:` a declarar (a varredura é automática). O tema mora no CSS, em
// `app/globals.css`.
export default {
  plugins: ["@tailwindcss/postcss"],
};
