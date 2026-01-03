/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { ParticipantProgressBadge } from "../ParticipantProgressBadge";

describe("ParticipantProgressBadge", () => {
  describe("not started state", () => {
    it("shows -- when not started (0 completed, not active)", () => {
      render(
        <ParticipantProgressBadge
          completedSteps={0}
          totalSteps={5}
          isCompleted={false}
          isActive={false}
        />
      );

      expect(screen.getByText("--")).toBeInTheDocument();
    });
  });

  describe("in progress state", () => {
    it("shows X/N when in progress", () => {
      render(
        <ParticipantProgressBadge
          completedSteps={2}
          totalSteps={5}
          isCompleted={false}
          isActive={true}
        />
      );

      expect(screen.getByText("2/5")).toBeInTheDocument();
    });

    it("shows active state when has completed steps but not fully completed", () => {
      render(
        <ParticipantProgressBadge
          completedSteps={3}
          totalSteps={5}
          isCompleted={false}
          isActive={true}
        />
      );

      expect(screen.getByText("3/5")).toBeInTheDocument();
    });
  });

  describe("completed state", () => {
    it("shows N/N with checkmark when completed", () => {
      render(
        <ParticipantProgressBadge
          completedSteps={5}
          totalSteps={5}
          isCompleted={true}
          isActive={false}
        />
      );

      expect(screen.getByText("5/5")).toBeInTheDocument();
    });
  });

  describe("size variants", () => {
    it("renders with sm size by default", () => {
      const { container } = render(
        <ParticipantProgressBadge
          completedSteps={2}
          totalSteps={5}
          isCompleted={false}
          isActive={true}
        />
      );

      const badge = container.firstChild;
      expect(badge).toHaveClass("text-xs");
    });

    it("renders with md size when specified", () => {
      const { container } = render(
        <ParticipantProgressBadge
          completedSteps={2}
          totalSteps={5}
          isCompleted={false}
          isActive={true}
          size="md"
        />
      );

      const badge = container.firstChild;
      expect(badge).toHaveClass("text-sm");
    });
  });
});
