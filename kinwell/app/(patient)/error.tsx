"use client";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PatientError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center" role="alert">
      <AlertCircle className="h-10 w-10 text-danger" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-muted">We couldn&apos;t load this page. Your information is safe. {error.digest ? <span className="text-[12px]">(Ref {error.digest})</span> : null}</p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
