import { CommandHint } from "@/components/cmdk/CommandHint";
import { CommandPalette } from "@/components/cmdk/CommandPalette";
import { HowItWorksModal } from "@/components/how-it-works/HowItWorksModal";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { AppShell } from "@/components/shell/AppShell";
import { SwrProvider } from "@/components/providers/SwrProvider";
import { ToastBridge } from "@/components/providers/ToastBridge";
import { ShortcutsOverlay } from "@/components/shortcuts/ShortcutsOverlay";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SwrProvider>
      <ToastBridge />
      <CommandPalette />
      <CommandHint />
      <ShortcutsOverlay />
      <HowItWorksModal />
      <OnboardingTour />
      <AppShell>{children}</AppShell>
    </SwrProvider>
  );
}
