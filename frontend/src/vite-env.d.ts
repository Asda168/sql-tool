/// <reference types="vite/client" />
declare module '*?worker' { const W: { new (): Worker }; export default W }
