import { Host_Grotesk } from "next/font/google";
import localFont from "next/font/local";

export const hostGrotesk = Host_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans-face",
  display: "swap",
});

export const zodiak = localFont({
  src: [
    {
      path: "../fonts/zodiak-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/zodiak-400-italic.woff2",
      weight: "400",
      style: "italic",
    },
  ],
  variable: "--font-serif-face",
  display: "swap",
});
