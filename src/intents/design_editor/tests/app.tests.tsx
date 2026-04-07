import { TestAppI18nProvider } from "@canva/app-i18n-kit";
import { TestAppUiProvider } from "@canva/app-ui-kit";
import { act, fireEvent, render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";
import { App } from "../app";

function renderInTestProvider(node: ReactNode): RenderResult {
  return render(
    <TestAppI18nProvider>
      <TestAppUiProvider>{node}</TestAppUiProvider>,
    </TestAppI18nProvider>,
  );
}

describe("Smart Layout App", () => {
  it("renders app title and primary action", () => {
    const result = renderInTestProvider(<App />);

    expect(result.getByRole("heading", { name: "🧠 Smart Layout Assistant" })).toBeTruthy();
    expect(result.getByRole("button", { name: "常规排版" })).toBeTruthy();
    expect(result.getByRole("button", { name: "灵感版排版" })).toBeTruthy();
    expect(result.getByRole("button", { name: "🚀 一键智能排版" })).toBeTruthy();
  });

  it("allows clicking the smart layout button", async () => {
    const result = renderInTestProvider(<App />);
    const button = result.getByRole("button", {
      name: "🚀 一键智能排版",
    });

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    expect(button).toBeTruthy();
  });
});
