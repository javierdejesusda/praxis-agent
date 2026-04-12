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
      <AppShell>{children}</AppShell>
    </SwrProvider>
  );
}
