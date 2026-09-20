import type { Metadata } from "next";
import { FluentProvider } from "@fluentui/react-provider";
import { createLightTheme } from "@fluentui/react-theme";
import "./styles.css";
export const metadata: Metadata = {
  title: "JEV Browser",
  description: "Inspectable browser orchestration workspace",
};
const theme = createLightTheme({
  10: "#042c30",
  20: "#07454b",
  30: "#0a555b",
  40: "#0f5c63",
  50: "#287c78",
  60: "#48948c",
  70: "#70aca2",
  80: "#9ac4b8",
  90: "#b7d5c9",
  100: "#c9dfd6",
  110: "#d9e8df",
  120: "#e5efe8",
  130: "#edf5ee",
  140: "#f4f8f3",
  150: "#f9fbf8",
  160: "#ffffff",
});
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <FluentProvider theme={theme}>{children}</FluentProvider>
      </body>
    </html>
  );
}
