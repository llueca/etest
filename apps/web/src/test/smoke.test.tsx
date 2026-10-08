import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

it("renders React with jest-dom matchers in jsdom", () => {
  render(<button type="button">Hello</button>);
  expect(screen.getByRole("button", { name: "Hello" })).toBeEnabled();
});
