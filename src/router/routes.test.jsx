import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Boot, AppRoutes } from "./routes";

vi.mock("../store/appStore", () => ({
  useApp: () => ({
    products: [],
    categories: [],
    session: null,
    cart: [],
    wishlist: [],
    recentlyViewed: [],
    compare: [],
    reviews: [],
    siteSettings: {},
    inventoryLog: [],
  }),
  appActions: {},
}));

vi.mock("../hooks/useDocumentMeta", () => ({
  useDocumentMeta: vi.fn(),
}));

describe("Route lazy loading and boot screen", () => {
  it("renders Boot screen component with custom title and text", () => {
    render(<Boot title="Custom Boot" text="Custom message" />);
    expect(screen.getByText("Custom Boot")).toBeTruthy();
    expect(screen.getByText("Custom message")).toBeTruthy();
  });

  it("renders HomePage at root path /", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("renders NotFoundPage at non-existent route", async () => {
    render(
      <MemoryRouter initialEntries={["/this-route-does-not-exist-at-all"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/page not found|404/i)).toBeTruthy();
  });
});
