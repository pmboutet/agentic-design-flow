/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { ParticipantRow } from "../ParticipantRow";

describe("ParticipantRow", () => {
  const mockParticipant = {
    id: "user-1",
    name: "Alice Smith",
    email: "alice@example.com",
    role: "Product Manager",
    inviteToken: "abc123token",
  };

  const defaultProps = {
    participant: mockParticipant,
    selected: false,
    onToggle: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("basic rendering", () => {
    it("renders participant name and role", () => {
      render(<ParticipantRow {...defaultProps} />);

      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("Product Manager")).toBeInTheDocument();
    });

    it("renders checkbox unchecked when not selected", () => {
      render(<ParticipantRow {...defaultProps} selected={false} />);

      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).not.toBeChecked();
    });

    it("renders checkbox checked when selected", () => {
      render(<ParticipantRow {...defaultProps} selected={true} />);

      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).toBeChecked();
    });
  });

  describe("selection behavior", () => {
    it("calls onToggle when checkbox is clicked", () => {
      const onToggle = jest.fn();
      render(<ParticipantRow {...defaultProps} onToggle={onToggle} />);

      const checkbox = screen.getByRole("checkbox");
      fireEvent.click(checkbox);

      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("does not call onToggle when disabled", () => {
      const onToggle = jest.fn();
      render(<ParticipantRow {...defaultProps} onToggle={onToggle} disabled={true} />);

      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).toBeDisabled();
    });
  });

  describe("action buttons visibility", () => {
    it("does not show copy button when not selected", () => {
      render(<ParticipantRow {...defaultProps} selected={false} askKey="test-ask" />);

      expect(screen.queryByTitle("Copy invite link")).not.toBeInTheDocument();
    });

    it("shows copy button when selected and has askKey", () => {
      render(<ParticipantRow {...defaultProps} selected={true} askKey="test-ask" />);

      expect(screen.getByTitle("Copy invite link")).toBeInTheDocument();
    });

    it("shows send invite button when selected and has email", () => {
      const onSendInvite = jest.fn();
      render(
        <ParticipantRow
          {...defaultProps}
          selected={true}
          askKey="test-ask"
          onSendInvite={onSendInvite}
        />
      );

      expect(screen.getByTitle("Send invite email")).toBeInTheDocument();
    });

    it("does not show send invite button without onSendInvite callback", () => {
      render(<ParticipantRow {...defaultProps} selected={true} askKey="test-ask" />);

      expect(screen.queryByTitle("Send invite email")).not.toBeInTheDocument();
    });
  });

  describe("progress display", () => {
    it("does not show progress badge when showProgress is false", () => {
      render(
        <ParticipantRow
          {...defaultProps}
          showProgress={false}
          progress={{ completedSteps: 2, totalSteps: 5, isCompleted: false, isActive: true }}
        />
      );

      expect(screen.queryByText("2/5")).not.toBeInTheDocument();
    });

    it("shows progress badge when showProgress is true", () => {
      render(
        <ParticipantRow
          {...defaultProps}
          showProgress={true}
          progress={{ completedSteps: 2, totalSteps: 5, isCompleted: false, isActive: true }}
        />
      );

      expect(screen.getByText("2/5")).toBeInTheDocument();
    });

    it("does not show progress badge when progress is null", () => {
      render(<ParticipantRow {...defaultProps} showProgress={true} progress={null} />);

      // Should not have any X/Y pattern
      expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument();
    });
  });

  describe("fallback display name", () => {
    it("uses email when name is empty", () => {
      render(
        <ParticipantRow
          {...defaultProps}
          participant={{ ...mockParticipant, name: "", email: "fallback@example.com" }}
        />
      );

      expect(screen.getByText("fallback@example.com")).toBeInTheDocument();
    });

    it("uses id when name and email are empty", () => {
      render(
        <ParticipantRow
          {...defaultProps}
          participant={{ id: "fallback-id", name: "", email: null }}
        />
      );

      expect(screen.getByText("fallback-id")).toBeInTheDocument();
    });
  });
});
