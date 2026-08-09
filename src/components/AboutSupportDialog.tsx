import {
  Bug,
  Download,
  ExternalLink,
  Github,
  Globe2,
  Scale,
  ShieldCheck
} from "lucide-react";
import type { ReactNode } from "react";
import { version } from "../../package.json";
import { AppDialog } from "./AppDialog";

export function AboutSupportDialog({
  onReportIssue,
  onExportDiagnostics,
  onOpenPrivacyPolicy,
  onOpenRepository,
  onOpenWebsite,
  onClose
}: {
  onReportIssue: () => void | Promise<void>;
  onExportDiagnostics: () => void | Promise<void>;
  onOpenPrivacyPolicy: () => void | Promise<void>;
  onOpenRepository: () => void | Promise<void>;
  onOpenWebsite: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <AppDialog
      title="About & Support"
      description="Product details, project links, and optional support tools."
      confirmLabel="Done"
      showCancel={false}
      onCancel={onClose}
      onConfirm={onClose}
    >
      <section className="rounded-lg border border-blue-400/20 bg-blue-500/5 p-4">
        <div className="flex items-start gap-3">
          <img src="/app-icon.png" alt="" aria-hidden="true" className="h-12 w-12 shrink-0 rounded-xl shadow-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold text-zinc-100">VerityPDF</h3>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">Version {version}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              A free, open-source PDF editor that processes documents locally without accounts, cloud uploads, analytics, or advertising.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <LinkButton onClick={onOpenWebsite} tone="orange"><Globe2 size={14} />Website<ExternalLink size={12} /></LinkButton>
              <LinkButton onClick={onOpenPrivacyPolicy} tone="blue"><ShieldCheck size={14} />Privacy policy<ExternalLink size={12} /></LinkButton>
              <LinkButton onClick={onOpenRepository}><Github size={14} />Source code<ExternalLink size={12} /></LinkButton>
              <span className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-xs font-medium text-zinc-400"><Scale size={14} />AGPL-3.0</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-3 rounded-lg border border-white/10 bg-black/15 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-300"><Bug size={18} /></div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-zinc-100">Help improve VerityPDF</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              Report a bug or request a feature on GitHub. Nothing is sent automatically; exporting diagnostics gives you a local file to review before sharing.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <LinkButton onClick={onReportIssue} tone="orange"><ExternalLink size={14} />Report an issue on GitHub</LinkButton>
              <LinkButton onClick={onExportDiagnostics}><Download size={14} />Export diagnostic report</LinkButton>
            </div>
          </div>
        </div>
      </section>
    </AppDialog>
  );
}

function LinkButton({ children, onClick, tone = "neutral" }: { children: ReactNode; onClick: () => void | Promise<void>; tone?: "orange" | "blue" | "neutral" }) {
  const color = tone === "orange"
    ? "bg-orange-500/15 text-orange-100 hover:bg-orange-500/25"
    : tone === "blue"
      ? "bg-blue-500/15 text-blue-100 hover:bg-blue-500/25"
      : "bg-white/10 text-zinc-200 hover:bg-white/15";
  return <button type="button" className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold ${color}`} onClick={() => void onClick()}>{children}</button>;
}
