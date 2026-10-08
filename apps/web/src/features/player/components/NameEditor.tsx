import { validateDisplayName } from "@btc/shared/domain";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { RenameResult } from "../hooks/useGame.ts";

interface Props {
  displayName: string;
  maxLength: number;
  onSave(displayName: string): Promise<RenameResult>;
}

/** Inline display-name editor: the error sits next to the input, which keeps what was typed. */
export function NameEditor({ displayName, maxLength, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  useEffect(() => {
    if (editing) input.current?.select();
    else if (wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const startEditing = () => {
    setDraft(displayName);
    setError(null);
    setSaved(false);
    setEditing(true);
  };

  const cancel = () => {
    setError(null);
    setEditing(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const validation = validateDisplayName(draft, maxLength);
    if (!validation.ok) {
      setError(validation.reason);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await onSave(validation.value);
    setSaving(false);
    if (result.ok) {
      setEditing(false);
      setSaved(true);
    } else {
      setError(result.message);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") cancel();
  };

  if (!editing) {
    return (
      <div className="name">
        <p className="name-current">{displayName}</p>
        <button type="button" className="btn btn-quiet" ref={editButton} onClick={startEditing}>
          Edit name
        </button>
        {saved && (
          <p className="name-saved" role="status">
            Name saved.
          </p>
        )}
      </div>
    );
  }

  return (
    <form className="name name--editing" onSubmit={submit} noValidate>
      <label htmlFor="display-name" className="sr-only">
        Display name
      </label>
      <input
        id="display-name"
        ref={input}
        className="name-input"
        type="text"
        value={draft}
        autoComplete="off"
        readOnly={saving}
        aria-invalid={error !== null}
        aria-describedby={error ? "display-name-error" : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <button type="submit" className="btn btn-quiet" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button type="button" className="btn btn-quiet" disabled={saving} onClick={cancel}>
        Cancel
      </button>
      {error && (
        <p id="display-name-error" className="error name-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
