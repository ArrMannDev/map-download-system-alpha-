import "./globals.css";

export const metadata = {
  title: "DPS Map Download",
  description: "Request and securely download DPS map PDFs with email OTP verification.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
