import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NameEditor } from "./NameEditor.tsx";

function setup(onSave = vi.fn().mockResolvedValue({ ok: true })) {
  const user = userEvent.setup();
  render(<NameEditor displayName="Player-0042" maxLength={24} onSave={onSave} />);
  return { user, onSave };
}

const openEditor = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Edit name" }));

describe("NameEditor", () => {
  it("links the validation message to the input and keeps what was typed", async () => {
    const { user, onSave } = setup();
    await openEditor(user);
    const input = screen.getByRole("textbox", { name: "Display name" });
    await user.clear(input);
    await user.type(input, "n".repeat(25));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(input).toHaveAccessibleDescription(/24/);
    expect(input).toBeInvalid();
    expect(screen.getByRole("alert")).toHaveTextContent(/24/);
    expect(input).toHaveValue("n".repeat(25));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("rejects an empty name the same way", async () => {
    const { user } = setup();
    await openEditor(user);
    await user.clear(screen.getByRole("textbox"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("textbox")).toHaveAccessibleDescription(/empty/i);
  });

  it("keeps the input and shows the server's error when saving fails", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: false, message: "Could not save the name." });
    const { user } = setup(onSave);
    await openEditor(user);
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Dario");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("Dario");
    expect(input).toHaveValue("Dario");
    expect(input).toHaveAccessibleDescription("Could not save the name.");
  });

  it("cancels with Escape: nothing is sent and the name is unchanged", async () => {
    const { user, onSave } = setup();
    await openEditor(user);
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Not saved{Escape}");

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Player-0042")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    // Focus returns to the control that opened the editor.
    expect(screen.getByRole("button", { name: "Edit name" })).toHaveFocus();
  });

  it("shows a saving state, then confirms success", async () => {
    let finish: (value: { ok: true }) => void = () => {};
    const onSave = vi.fn(() => new Promise<{ ok: true }>((resolve) => (finish = resolve)));
    const { user } = setup(onSave);
    await openEditor(user);
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "  Dario  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(onSave).toHaveBeenCalledWith("Dario"); // trimmed

    finish({ ok: true });
    expect(await screen.findByRole("status")).toHaveTextContent("Name saved.");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
