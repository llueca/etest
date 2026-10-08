import { type KeyboardEvent, useId, useLayoutEffect, useRef, useState } from "react";
import { formatDuration } from "../../../lib/format.ts";
import { readHideInstructions, writeHideInstructions } from "../preference.ts";

interface Props {
  open: boolean;
  /** Called however the dialog closes (Got it or Escape). */
  onClose(): void;
  predictionWindowSeconds: number;
}

/**
 * The How to play dialog (design D14). A native modal <dialog>: the browser makes the game
 * behind it inert, keeps focus inside and closes it on Escape.
 */
export function InstructionsDialog({ open, onClose, predictionWindowSeconds }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const gotIt = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [hide, setHide] = useState(readHideInstructions);

  // Layout effect: the dialog is already open in the commit in which the game screen appears.
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      setHide(readHideInstructions());
      element.showModal();
      gotIt.current?.focus();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  // A modal dialog makes the page inert, but Tab at its last control still leaves for the browser UI.
  const keepFocusInside = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab" || !dialog.current) return;
    const tabbable = dialog.current.querySelectorAll<HTMLElement>("input, button, [tabindex='0']");
    const first = tabbable[0];
    const last = tabbable[tabbable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const predictionWindow = formatDuration(predictionWindowSeconds);
  return (
    <dialog
      ref={dialog}
      className="instructions"
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={keepFocusInside}
    >
      {/* Content only while open: a closed dialog adds no text to the page. */}
      {open && (
        <>
          <h2 id={titleId} className="instructions-title">
            How to play
          </h2>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard-focusable so the text can be scrolled on small screens */}
          <section className="instructions-body" tabIndex={0} aria-labelledby={titleId}>
            <ol>
              <li>
                Will BTC/USD be <strong>higher (UP)</strong> or <strong>lower (DOWN)</strong> after
                the prediction window of {predictionWindow}? Press Higher or Lower.
              </li>
              <li>
                Your entry price is the server's BTC/USD price at the moment you predict. Only one
                prediction can be active at a time.
              </li>
              <li>
                After the prediction window, the first price that differs from your entry price
                decides the result: correct is <strong>+1</strong>, wrong is <strong>−1</strong>.
                While the price is unchanged, the prediction waits.
              </li>
              <li>
                The live WINNING / LOSING status is only a guide. The server's result is what
                counts.
              </li>
              <li>
                Your prediction is settled even if you close the page, and your progress is saved in
                this browser.
              </li>
              <li>
                The score leaderboard ranks players by score. The predictor leaderboard ranks by
                adjusted accuracy, which favours a longer record over a few lucky guesses.
              </li>
            </ol>
          </section>
          <div className="instructions-footer">
            <label className="instructions-check">
              <input
                type="checkbox"
                checked={hide}
                onChange={(event) => {
                  setHide(event.target.checked);
                  writeHideInstructions(event.target.checked);
                }}
              />
              {"Don't show again"}
            </label>
            <button
              type="button"
              className="btn btn-primary"
              ref={gotIt}
              onClick={() => dialog.current?.close()}
            >
              Got it
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
