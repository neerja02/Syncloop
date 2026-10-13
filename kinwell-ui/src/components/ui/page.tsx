import { cn } from "@/lib/utils/cn";

export function PageContainer({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={cn("mx-auto w-full px-4 py-5 sm:px-6 sm:py-8", wide ? "max-w-5xl" : "max-w-3xl")}>{children}</div>;
}
