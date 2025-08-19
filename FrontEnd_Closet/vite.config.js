// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'

// // https://vite.dev/config/
// export default defineConfig({
//   plugins: [react()],
// })


import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://15.165.129.131:3000",
      "/auth": "http://15.165.129.131:3000",
      "/unity-viewer": "http://15.165.129.131:3000",
    },
  },
});