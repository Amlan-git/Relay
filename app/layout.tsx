import type { ReactNode } from "react";

export const metadata = {
  title: "Relay",
  description: "n8n workflow → client-ready Notion SOP",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
