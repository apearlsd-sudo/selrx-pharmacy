import { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function PageHeader({ icon: Icon, title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6 animate-slide-down">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
          <Icon className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
