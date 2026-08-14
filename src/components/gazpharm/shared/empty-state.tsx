import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 sm:py-12 px-4 text-center animate-fade-in">
      <div className="flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-muted mb-3">
        <Icon className="h-6 w-6 sm:h-7 sm:w-7 text-muted-foreground" />
      </div>
      <h3 className="text-xs sm:text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-sm">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} size="sm" className="mt-4">
          {action.label}
        </Button>
      )}
    </div>
  );
}
