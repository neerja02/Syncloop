import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/api/auth";

export function SignOutButton() {
  return (
    <Button variant="secondary" className="w-full" size="lg" onClick={() => void signOutAction()}>
      <LogOut className="h-5 w-5" aria-hidden /> Sign out
    </Button>
  );
}
