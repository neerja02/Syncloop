"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { createFolderAction } from "@/features/reports/actions";
import { createProfileAction } from "@/features/family/actions";
import { useShell } from "../shell-context";

export function FolderDialog({ onClose }: { onClose: () => void }) {
  const shell = useShell();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="New folder" size="sm">
      <form
        action={(f) =>
          start(async () => {
            const r = await createFolderAction(shell.familyId, String(f.get("name") ?? ""));
            if (!r.ok) return setError(r.error);
            onClose();
            router.push(`/reports/folder/${r.data!.id}`);
          })
        }
        className="space-y-4"
      >
        <FormError message={error} />
        <Field label="Folder name" htmlFor="fd-name">
          <Input id="fd-name" name="name" required maxLength={60} autoFocus placeholder="e.g. Mom's Thyroid" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            Create folder
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ProfileDialog({ relationship, onClose }: { relationship?: string; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [rel, setRel] = useState(relationship ?? "mother");
  const pet = rel === "pet";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={pet ? "Add a pet" : "Add a family profile"} description={pet ? "Pets get their own private profile, and vet-specific guidance." : "Each person's health information stays separate and private."}>
      <form
        action={(f) =>
          start(async () => {
            const r = await createProfileAction({
              displayName: f.get("displayName"),
              relationship: f.get("relationship"),
              dateOfBirth: f.get("dateOfBirth") || null,
              sex: f.get("sex") || null,
              species: pet ? f.get("species") : null,
              breed: pet ? f.get("breed") || null : null,
              weightKg: pet ? f.get("weightKg") || null : null,
            });
            if (!r.ok) return setError(r.error);
            onClose();
            router.push(`/family/${r.data!.id}`);
          })
        }
        className="space-y-4"
      >
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" htmlFor="pf-name" required className="col-span-2">
            <Input id="pf-name" name="displayName" required maxLength={60} placeholder={pet ? "e.g. Bruno" : "e.g. Mom or Asha"} autoFocus />
          </Field>
          <Field label="Who is this?" htmlFor="pf-rel">
            <Select id="pf-rel" name="relationship" value={rel} onChange={(e) => setRel(e.target.value)}>
              {[
                ["mother", "Mother"],
                ["father", "Father"],
                ["spouse", "Spouse"],
                ["child", "Child or baby"],
                ["sibling", "Sibling"],
                ["grandparent", "Grandparent"],
                ["other", "Other person"],
                ["pet", "Pet"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          {pet ? (
            <Field label="Animal" htmlFor="pf-species" required>
              <Select id="pf-species" name="species" defaultValue="dog">
                <option value="dog">Dog</option>
                <option value="cat">Cat</option>
                <option value="rabbit">Rabbit</option>
                <option value="bird">Bird</option>
                <option value="other">Other</option>
              </Select>
            </Field>
          ) : (
            <Field label="Sex" htmlFor="pf-sex" hint="(optional)">
              <Select id="pf-sex" name="sex" defaultValue="">
                <option value="">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="intersex">Intersex</option>
              </Select>
            </Field>
          )}
          <Field label="Date of birth" htmlFor="pf-dob" hint="(optional)" className={pet ? "" : "col-span-2"}>
            <Input id="pf-dob" name="dateOfBirth" type="date" max={new Date().toISOString().slice(0, 10)} />
          </Field>
          {pet && (
            <>
              <Field label="Weight (kg)" htmlFor="pf-w" hint="(optional)">
                <Input id="pf-w" name="weightKg" inputMode="decimal" placeholder="e.g. 12" />
              </Field>
              <Field label="Breed" htmlFor="pf-breed" hint="(optional)" className="col-span-2">
                <Input id="pf-breed" name="breed" maxLength={60} placeholder="e.g. Labrador" />
              </Field>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {pet ? "Add pet" : "Add profile"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

