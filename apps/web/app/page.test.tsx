import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import Page from "./page";

describe("<Page />", () => {
  it("renders both the desktop and mobile wrappers", () => {
    const { container } = render(<Page />);
    expect(container.querySelector(".layout-desktop")).not.toBeNull();
    expect(container.querySelector(".layout-mobile")).not.toBeNull();
  });

  it("contains the Itamambuca spot title in the document", () => {
    const { container } = render(<Page />);
    expect(container.textContent).toContain("Itamambuca");
  });
});
