import { CommandPalette } from "@/components/cmdk/CommandPalette";
import { AppShell } from "@/components/shell/AppShell";
import { SwrProvider } from "@/components/providers/SwrProvider";
import { ToastBridge } from "@/components/providers/ToastBridge";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SwrProvider>
      <ToastBridge />
      <CommandPalette />
      <AppShell>{children}</AppShell>
    </SwrProvider>
  );
}
